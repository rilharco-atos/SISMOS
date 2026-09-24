import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { XmlParserService } from '../src/modules/comunicados/xml-parser.service';
import { TEMPLATES, preencherTemplate, avaliarEnvioAutomatico } from '../src/modules/comunicados/templates';
import { formatarReferencia } from '../src/modules/comunicados/referencia.service';
import { linhasEvento, versaoLabel, DocumentoComunicado } from '../src/modules/comunicados/documento';
import { wallTimeToUtc, formatInZone, anoLisboa } from '../src/common/tz.util';
import { XML_AUTOMATICO, XML_MANUAL } from './fixtures';

const parser = new XmlParserService();

describe('XmlParserService', () => {
  test('lê o XML automático (1ª versão)', () => {
    const d = parser.parse(XML_AUTOMATICO);
    assert.equal(d.templateId, '0001');
    assert.equal(d.areaName, 'Continente');
    assert.equal(d.local, 'a cerca de 30 km a Sudoeste de Faro');
    assert.equal(d.magnitude, 2.6);
    assert.equal(d.depth, 17.5);
    assert.deepEqual(d.smsKeys, ['LIC']);
    assert.deepEqual(d.emailKeys, ['LIC']);
    assert.equal(d.creatingUser, 'Carolina Antunes');
    assert.equal(d.temInfoMacrossismica, false);
    assert.ok(d.klmLink.includes('&q=36.812'));
  });

  test('eventDateTime é hora de Lisboa (11:15:36 WEST = 10:15:36 UTC)', () => {
    assert.equal(parser.parse(XML_AUTOMATICO).eventDateTime.toISOString(), '2026-09-06T10:15:36.000Z');
  });

  test('lê o XML manual (2ª versão) com informação macrossísmica', () => {
    const d = parser.parse(XML_MANUAL);
    assert.equal(d.templateId, '0004');
    assert.equal(d.intmax, 'III');
    assert.equal(d.regiaoIntmax, 'Albufeira');
    assert.equal(d.temInfoMacrossismica, true);
  });

  test('rejeita XML sem <event>', () => {
    assert.throws(() => parser.parse('<report></report>'), BadRequestException);
  });

  test('rejeita DOCTYPE/ENTITY (XXE)', () => {
    assert.throws(() => parser.parse('<!DOCTYPE x [<!ENTITY a "b">]>' + XML_AUTOMATICO.replace(/^<\?xml[^>]*>/, '')), BadRequestException);
  });

  test('rejeita lista desconhecida e magnitude inválida, indicando os campos', () => {
    const xml = XML_AUTOMATICO.replace('<smsKey>LIC</smsKey>', '<smsKey>XYZ</smsKey>').replace('<magnitud>2.6</magnitud>', '<magnitud>abc</magnitud>');
    assert.throws(() => parser.parse(xml), (e: any) => /smsKey/.test(e.message) && /magnitud/.test(e.message));
  });

  test('Açores: hora local convertida com o fuso dos Açores', () => {
    const xml = XML_AUTOMATICO.replace('<areaName>Continente</areaName>', '<areaName>Açores</areaName>');
    assert.equal(parser.parse(xml).eventDateTime.toISOString(), '2026-09-06T11:15:36.000Z');
  });
});

describe('Templates', () => {
  test('existem os 8 templates oficiais 0000–0007', () => {
    assert.deepEqual(Object.keys(TEMPLATES), ['0000', '0001', '0002', '0003', '0004', '0005', '0006', '0007']);
  });

  test('0004 é preenchido com os dados do XML manual', () => {
    const d = parser.parse(XML_MANUAL);
    const t = preencherTemplate('0004', d);
    assert.ok(t.includes('no dia 06-09-2026 pelas 11:15 (hora local)'));
    assert.ok(t.includes('Rede Sísmica do Continente, um sismo de magnitude 2.6 (Richter)'));
    assert.ok(t.includes('epicentro se localizou a cerca de 30 km a Sudoeste de Faro.'));
    assert.ok(t.includes('fortemente sentido na região de Albufeira, atingindo uma intensidade máxima de III.'));
    assert.ok(t.includes('[--mais info macrossísmica complementar detalhada--]'), 'marcador sem dado mantém-se para o analista');
  });

  test('marcadores sem dados ficam intactos', () => {
    const t = preencherTemplate('0003', { areaName: 'Continente' });
    assert.ok(t.includes('[dd-mm-aaaa]'));
    assert.ok(t.includes('{m.m]'));
    assert.ok(t.includes('[--info macrossísmica detalhada--]'));
  });

  test('texto fixo dos templates não é alterado pelo preenchimento', () => {
    const t = preencherTemplate('0007', parser.parse(XML_AUTOMATICO));
    assert.ok(t.includes('desligar o gás, a eletricidade e a água'));
    assert.ok(t.endsWith('Toda e qualquer utilização do conteúdo deste comunicado deverá sempre fazer referência à fonte.'));
  });
});

describe('Envio automático', () => {
  test('0001 totalmente preenchido a partir do XML automático pode ser enviado', () => {
    const d = parser.parse(XML_AUTOMATICO);
    assert.deepEqual(avaliarEnvioAutomatico(preencherTemplate('0001', d), d.emailKeys, d.smsKeys), { enviar: true });
  });

  test('fica retido se o texto tiver marcadores por preencher', () => {
    const d = parser.parse(XML_MANUAL);
    const r = avaliarEnvioAutomatico(preencherTemplate('0004', d), d.emailKeys, d.smsKeys);
    assert.equal(r.enviar, false);
    assert.match(r.motivo!, /mais info macrossísmica/);
  });

  test('genérico 0000 nunca é enviado sem edição', () => {
    assert.equal(avaliarEnvioAutomatico(preencherTemplate('0000', {}), ['LIC'], []).enviar, false);
  });

  test('fica retido sem listas de destino', () => {
    const d = parser.parse(XML_AUTOMATICO);
    assert.match(avaliarEnvioAutomatico(preencherTemplate('0001', d), [], []).motivo!, /listas/);
  });
});

describe('Referência e versão', () => {
  test('formato SISM-AAAA-NNNN', () => {
    assert.equal(formatarReferencia(2026, 7), 'SISM-2026-0007');
    assert.equal(formatarReferencia(2026, 12345), 'SISM-2026-12345');
  });

  test('versão com 3 dígitos', () => {
    assert.equal(versaoLabel(1), '001');
    assert.equal(versaoLabel(12), '012');
  });

  test('ano da referência segue a hora de Lisboa na passagem de ano', () => {
    assert.equal(anoLisboa(new Date('2026-12-31T23:30:00Z')), 2026);
    assert.equal(anoLisboa(new Date('2027-01-01T00:30:00Z')), 2027);
  });
});

describe('Fuso horário', () => {
  test('inverno em Lisboa = UTC', () => {
    assert.equal(wallTimeToUtc('2026-01-10T08:00:00', 'Europe/Lisbon').toISOString(), '2026-01-10T08:00:00.000Z');
  });
  test('respeita fuso explícito', () => {
    assert.equal(wallTimeToUtc('2026-09-06T11:15:36Z', 'Europe/Lisbon').toISOString(), '2026-09-06T11:15:36.000Z');
  });
  test('formato SMS', () => {
    assert.equal(formatInZone(new Date('2026-09-08T16:41:00Z'), 'Atlantic/Azores', 'sms'), '2026Set08 16:41');
  });
});

describe('Documento', () => {
  test('linhas do evento omitem campos vazios e mostram hora local e UTC', () => {
    const d = parser.parse(XML_AUTOMATICO);
    const doc: DocumentoComunicado = { referencia: 'SISM-2026-0001', versao: 1, titulo: 't', texto: 'x', templateId: '0001', dataEmissao: new Date(), ...d };
    const linhas = Object.fromEntries(linhasEvento(doc));
    assert.equal(linhas['Data e hora'], '06-09-2026 11:15 (hora local) · 06-09-2026 10:15 UTC');
    assert.equal(linhas['Coordenadas'], '36.81°N / 8.16°W');
    assert.equal(linhas['Magnitude'], '2.6 (Richter)');
    assert.equal(linhas['Intensidade máxima'], undefined);
  });
});
