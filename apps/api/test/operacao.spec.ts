import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { elegivel, chaveTelefone, chaveEmail } from '../src/modules/delivery/politica-envio';
import { resolverAmbiente, resolverSms } from '../src/modules/settings/settings.resolver';
import { avaliarBackup, avaliarEnvio, avaliarFtp, avaliarWebsite, estadoGlobal } from '../src/modules/system/saude';
import { MetricsService, M } from '../src/modules/observability/metrics.service';
import { lerCsv } from '../src/common/csv';
import { mapearComunicado, mapearDestinatario, mapearVersao } from '../src/modules/migracao/mapeamento';
import { FicheiroPublisher, criarPublisher, PublicacaoWebsite } from '../src/modules/website/publishers';
import { StorageService, chaveDe, resolverDriver } from '../src/modules/storage/storage.service';
import { urlComPooler } from '../src/prisma/prisma.service';

const HORA = 3600_000;

describe('Ambiente de testes', () => {
  test('APP_ENV=test impõe modo teste mesmo com "production" no backoffice', () => {
    const env = (k: string) => ({ APP_ENV: 'test' } as Record<string, string>)[k];
    const r = resolverSms({ smsMode: 'production' }, env);
    assert.equal(r.modo, 'test');
    assert.equal(r.impostoPeloAmbiente, true);
    assert.equal(resolverAmbiente(env), 'test');
  });

  test('envio simulado só fora de produção', () => {
    assert.equal(resolverSms(null, k => ({ APP_ENV: 'test', ENVIO_SIMULADO: 'true' } as any)[k]).simulado, true);
    assert.equal(resolverSms(null, k => ({ APP_ENV: 'production', ENVIO_SIMULADO: 'true' } as any)[k]).simulado, false);
    assert.equal(resolverSms(null, k => ({ APP_ENV: 'test' } as any)[k]).simulado, false);
  });

  test('em produção o backoffice decide', () => {
    const env = (k: string) => ({ APP_ENV: 'production' } as Record<string, string>)[k];
    assert.equal(resolverSms({ smsMode: 'production' }, env).modo, 'production');
    assert.equal(resolverAmbiente(() => undefined), 'development');
  });

  test('modo teste: só contactos internos são elegíveis', () => {
    assert.equal(elegivel({ id: '1', interno: true }, 'test'), true);
    assert.equal(elegivel({ id: '2', interno: false }, 'test'), false);
    assert.equal(elegivel({ id: '3' }, 'test'), false);
    assert.equal(elegivel({ id: '4', interno: false }, 'production'), true);
  });

  test('deduplicação normaliza email e telefone', () => {
    assert.equal(chaveEmail(' Ana@IPMA.pt '), 'ana@ipma.pt');
    assert.equal(chaveTelefone('912 345 678'), '+351912345678');
    assert.equal(chaveTelefone('+351 912 345 678'), '+351912345678');
  });
});

describe('Saúde', () => {
  const agora = Date.parse('2026-09-24T12:00:00Z');
  test('FTP: erro mais recente que sucesso → erro; sucesso antigo → degradado', () => {
    assert.equal(avaliarFtp(undefined, false, 30000).estado, 'desativado');
    assert.equal(avaliarFtp({ ultimoSucesso: '2026-09-24T11:59:50Z', ultimoErro: '2026-09-24T11:59:55Z', mensagemErro: 'ECONNREFUSED' }, true, 30000, agora).estado, 'erro');
    assert.equal(avaliarFtp({ ultimoSucesso: '2026-09-24T11:50:00Z' }, true, 30000, agora).estado, 'degradado');
    assert.equal(avaliarFtp({ ultimoSucesso: '2026-09-24T11:59:40Z' }, true, 30000, agora).estado, 'ok');
  });

  test('Envio: falha nas últimas 24h → degradado; falha antiga → ok', () => {
    assert.equal(avaliarEnvio({ ultimoErro: '2026-09-24T10:00:00Z', mensagemErro: 'x' }, agora).estado, 'degradado');
    assert.equal(avaliarEnvio({ ultimoErro: '2026-09-22T10:00:00Z' }, agora).estado, 'ok');
    assert.equal(avaliarEnvio(undefined, agora).estado, 'sem_dados');
  });

  test('Backups: inexistente em produção → degradado; antigo → degradado', () => {
    assert.equal(avaliarBackup(null, 26, true, agora).estado, 'degradado');
    assert.equal(avaliarBackup(null, 26, false, agora).estado, 'sem_dados');
    assert.equal(avaliarBackup(new Date(agora - 30 * HORA), 26, true, agora).estado, 'degradado');
    assert.equal(avaliarBackup(new Date(agora - 2 * HORA), 26, true, agora).estado, 'ok');
  });

  test('estado global', () => {
    assert.equal(estadoGlobal(false, []), 'down');
    assert.equal(estadoGlobal(true, [{ estado: 'ok' }, { estado: 'desativado' }, { estado: 'sem_dados' }]), 'ok');
    assert.equal(estadoGlobal(true, [{ estado: 'ok' }, avaliarWebsite({ ultimoErro: '2026-09-24T11:00:00Z' }, true)]), 'degraded');
  });
});

describe('Métricas Prometheus', () => {
  test('contadores com labels e formato de exposição', () => {
    const m = new MetricsService();
    m.inc(M.ENVIOS, { canal: 'email', resultado: 'ok' });
    m.inc(M.ENVIOS, { canal: 'email', resultado: 'ok' });
    m.inc(M.ENVIOS, { resultado: 'falha', canal: 'sms' });
    const txt = m.render();
    assert.match(txt, /# TYPE sismos_envios_total counter/);
    assert.match(txt, /sismos_envios_total\{canal="email",resultado="ok"\} 2/);
    assert.match(txt, /sismos_envios_total\{resultado="falha",canal="sms"\} 1/);
    assert.match(txt, /sismos_process_start_time_seconds \d+/);
  });
});

describe('CSV', () => {
  test('separador ";" com aspas, quebras de linha e BOM', () => {
    const r = lerCsv('﻿Referência;Texto\r\nA;"linha 1\nlinha ""2"""\r\nB;simples\r\n\r\n');
    assert.equal(r.length, 2);
    assert.deepEqual(r[0], { linha: 2, dados: { referencia: 'A', texto: 'linha 1\nlinha "2"' } });
    assert.equal(r[1].linha, 4);
  });
  test('separador ","', () => {
    assert.deepEqual(lerCsv('a,b\n1,2').map(x => x.dados), [{ a: '1', b: '2' }]);
  });
  test('aspas por fechar é erro', () => {
    assert.throws(() => lerCsv('a;b\n1;"2'));
  });
});

describe('Migração — mapeamento', () => {
  test('comunicado com vírgula decimal, data PT e referência antiga', () => {
    const r = mapearComunicado({ referencia: '042/2020', template_id: '1', estado: 'Enviado', area: 'Acores', data_evento_utc: '08-09-2020 16:41', lat: '37,77', lon: '-25,31', magnitude: '3,0', titulo: 't', texto: 'x' });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.valor.ano, 2020);
      assert.equal(r.valor.numeroAno, 42);
      assert.equal(r.valor.templateId, '0001');
      assert.equal(r.valor.areaName, 'Açores');
      assert.equal(r.valor.eventDateTime?.toISOString(), '2020-09-08T16:41:00.000Z');
      assert.equal(r.valor.lat, 37.77);
    }
  });
  test('erros agregados por campo', () => {
    const r = mapearComunicado({ referencia: 'X', template_id: '9', estado: 'talvez', titulo: '', texto: '' });
    assert.ok(!r.ok);
    if (!r.ok) assert.ok(r.erros.length >= 4);
  });
  test('versão com caminho de PDF fora da pasta é rejeitada', () => {
    const r = mapearVersao({ referencia: 'A', numero: '1', titulo: 't', texto: 'x', pdf_ficheiro: '../../etc/passwd' });
    assert.ok(!r.ok);
  });
  test('destinatário: listas separadas por | e validação de contacto', () => {
    const ok = mapearDestinatario({ nome: 'A', email: 'A@IPMA.PT', listas: 'lic|LGC', interno: 'sim' });
    assert.ok(ok.ok && ok.valor.listas.join() === 'LIC,LGC' && ok.valor.email === 'a@ipma.pt' && ok.valor.interno);
    assert.ok(!mapearDestinatario({ nome: 'B', listas: 'LIC' }).ok);
    assert.ok(!mapearDestinatario({ nome: 'C', email: 'c@x.pt', listas: 'ZZZ' }).ok);
  });
});

describe('Portabilidade (Vercel / servidor)', () => {
  test('chaves de ficheiro aceitam formatos antigos e rejeitam caminhos perigosos', () => {
    assert.equal(chaveDe('uploads\\pdfs\\SISM-2026-0001_v001.pdf'), 'pdfs/SISM-2026-0001_v001.pdf');
    assert.equal(chaveDe('/uploads/imagens/abc.png'), 'imagens/abc.png');
    assert.equal(chaveDe('pdfs/X.pdf'), 'pdfs/X.pdf');
    assert.equal(chaveDe('../../etc/passwd'), null);
    assert.equal(chaveDe('outra/x.pdf'), null);
    assert.equal(chaveDe(null), null);
  });

  test('driver de armazenamento: bd na Vercel, disco por omissão', () => {
    assert.equal(resolverDriver(() => undefined), 'disco');
    assert.equal(resolverDriver(k => ({ VERCEL: '1' } as any)[k]), 'bd');
    assert.equal(resolverDriver(k => ({ STORAGE_DRIVER: 'bd' } as any)[k]), 'bd');
  });

  test('armazenamento em disco: guardar, ler e remover', async () => {
    const s = new StorageService(null as any, 'disco');
    const chave = `pdfs/teste-${Date.now()}.pdf`;
    await s.guardar(chave, Buffer.from('%PDF-1.4 teste'), 'application/pdf');
    assert.equal((await s.ler(chave))?.conteudo.toString(), '%PDF-1.4 teste');
    await s.remover(chave);
    assert.equal(await s.ler(chave), null);
    await assert.rejects(s.guardar('../fora.txt', Buffer.from('x'), 'text/plain'));
  });

  test('URL com pooler recebe pgbouncer=true; sem pooler fica igual', () => {
    assert.equal(urlComPooler('postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require'), 'postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require&pgbouncer=true');
    assert.equal(urlComPooler('postgresql://u:p@localhost:5433/sismos'), 'postgresql://u:p@localhost:5433/sismos');
    assert.equal(urlComPooler('postgresql://u:p@h-pooler.x/db?pgbouncer=true'), 'postgresql://u:p@h-pooler.x/db?pgbouncer=true');
  });
});

describe('Website — publisher de ficheiros', () => {
  const pub = (ref: string, em: string): PublicacaoWebsite => ({
    referencia: ref, versao: 1, titulo: 't', texto: 'x', primeiraPagina: true, ativo: true, area: 'Continente',
    visivelDe: null, visivelAte: null, publicadoEm: em,
    evento: { dataHoraUtc: null, local: null, magnitude: 2.6, latitude: null, longitude: null, profundidadeKm: null, intensidadeMaxima: null },
  });

  test('publica, atualiza índice (mais recente primeiro) e remove', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sismos-web-'));
    const p = new FicheiroPublisher(dir);
    await p.publicar(pub('SISM-2026-0001', '2026-09-24T10:00:00Z'));
    await p.publicar(pub('SISM-2026-0002', '2026-09-24T11:00:00Z'));
    await p.publicar(pub('SISM-2026-0001', '2026-09-24T12:00:00Z'));
    let indice = JSON.parse(fs.readFileSync(path.join(dir, 'comunicados.json'), 'utf-8'));
    assert.deepEqual(indice.map((i: any) => i.referencia), ['SISM-2026-0001', 'SISM-2026-0002']);
    await p.remover('SISM-2026-0001');
    indice = JSON.parse(fs.readFileSync(path.join(dir, 'comunicados.json'), 'utf-8'));
    assert.deepEqual(indice.map((i: any) => i.referencia), ['SISM-2026-0002']);
    assert.equal(fs.existsSync(path.join(dir, 'SISM-2026-0001.json')), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('referência com caracteres de caminho é rejeitada', async () => {
    const p = new FicheiroPublisher(os.tmpdir());
    await assert.rejects(p.publicar(pub('../x', '2026-09-24T10:00:00Z')));
  });

  test('escolha da implementação pelo ambiente', () => {
    assert.equal(criarPublisher(() => undefined).nome, 'none');
    assert.equal(criarPublisher(k => ({ WEBSITE_PUBLISHER: 'http', IPMA_WEBSITE_API_URL: 'http://x' } as any)[k]).configurado, true);
    assert.equal(criarPublisher(k => ({ WEBSITE_PUBLISHER: 'ficheiro' } as any)[k]).configurado, false);
  });
});
