/**
 * Migração de dados do sistema atual para a nova plataforma SISMOS.
 *
 *   npm run migrar -- <pasta> [--aplicar] [--gerar-pdf]
 *
 * A pasta contém os ficheiros exportados do sistema antigo (formato em docs/migracao.md):
 *   comunicados.csv (obrigatório), versoes.csv (opcional), destinatarios.csv (opcional), pdfs/ (opcional).
 * Sem --aplicar apenas valida e mostra o que seria importado. É idempotente: comunicados com referência
 * já existente são ignorados; destinatários já existentes (mesmo email ou telefone) recebem as listas em falta.
 */
import { PrismaClient, ComunicadoOrigem, ListaKey } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { lerCsv } from '../src/common/csv';
import { mapearComunicado, mapearDestinatario, mapearVersao, ComunicadoMigrado, VersaoMigrada } from '../src/modules/migracao/mapeamento';
import { PdfService } from '../src/modules/comunicados/pdf.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { versaoLabel } from '../src/modules/comunicados/documento';

const SYSTEM_USER_ID = 'system';

interface Relatorio {
  modo: 'simulacao' | 'aplicado';
  pasta: string;
  inicio: string;
  fim?: string;
  comunicados: { lidos: number; importados: number; existentes: number; invalidos: number };
  versoes: { lidas: number; importadas: number; invalidas: number; pdfsCopiados: number; pdfsGerados: number };
  destinatarios: { lidos: number; criados: number; atualizados: number; invalidos: number };
  sequencias: Record<string, number>;
  erros: { ficheiro: string; linha: number; referencia?: string; erros: string[] }[];
}

function args() {
  const a = process.argv.slice(2);
  const pasta = a.find(x => !x.startsWith('--'));
  if (!pasta) {
    console.error('Uso: npm run migrar -- <pasta> [--aplicar] [--gerar-pdf]');
    process.exit(2);
  }
  return { pasta: path.resolve(pasta), aplicar: a.includes('--aplicar'), gerarPdf: a.includes('--gerar-pdf') };
}

function ler(pasta: string, nome: string) {
  const f = path.join(pasta, nome);
  return fs.existsSync(f) ? lerCsv(fs.readFileSync(f, 'utf-8')) : null;
}

async function main() {
  const { pasta, aplicar, gerarPdf } = args();
  const prisma = new PrismaClient();
  const storage = new StorageService(prisma);
  const pdf = new PdfService(storage);
  const rel: Relatorio = {
    modo: aplicar ? 'aplicado' : 'simulacao', pasta, inicio: new Date().toISOString(),
    comunicados: { lidos: 0, importados: 0, existentes: 0, invalidos: 0 },
    versoes: { lidas: 0, importadas: 0, invalidas: 0, pdfsCopiados: 0, pdfsGerados: 0 },
    destinatarios: { lidos: 0, criados: 0, atualizados: 0, invalidos: 0 },
    sequencias: {}, erros: [],
  };

  try {
    const linhasCom = ler(pasta, 'comunicados.csv');
    if (!linhasCom) throw new Error(`Não existe ${path.join(pasta, 'comunicados.csv')}`);

    // Versões agrupadas por referência.
    const versoesPorRef = new Map<string, VersaoMigrada[]>();
    for (const { linha, dados } of ler(pasta, 'versoes.csv') ?? []) {
      rel.versoes.lidas++;
      const v = mapearVersao(dados);
      if (!v.ok) { rel.versoes.invalidas++; rel.erros.push({ ficheiro: 'versoes.csv', linha, referencia: dados.referencia, erros: v.erros }); continue; }
      versoesPorRef.set(v.valor.referencia, [...(versoesPorRef.get(v.valor.referencia) ?? []), v.valor]);
    }

    const utilizadores = new Map((await prisma.user.findMany({ select: { id: true, email: true } })).map(u => [u.email.toLowerCase(), u.id]));
    const vistos = new Set<string>();

    for (const { linha, dados } of linhasCom) {
      rel.comunicados.lidos++;
      const m = mapearComunicado(dados);
      if (!m.ok) { rel.comunicados.invalidos++; rel.erros.push({ ficheiro: 'comunicados.csv', linha, referencia: dados.referencia, erros: m.erros }); continue; }
      const c = m.valor;
      if (vistos.has(c.referencia)) { rel.comunicados.invalidos++; rel.erros.push({ ficheiro: 'comunicados.csv', linha, referencia: c.referencia, erros: ['referência repetida no ficheiro'] }); continue; }
      vistos.add(c.referencia);

      const existe = await prisma.comunicado.findFirst({
        where: { OR: [{ referencia: c.referencia }, { ano: c.ano, numeroAno: c.numeroAno }] }, select: { referencia: true },
      });
      if (existe) {
        rel.comunicados.existentes++;
        if (existe.referencia !== c.referencia) rel.erros.push({ ficheiro: 'comunicados.csv', linha, referencia: c.referencia, erros: [`ano/número ${c.ano}/${c.numeroAno} já usado por ${existe.referencia}`] });
        continue;
      }

      const versoes = (versoesPorRef.get(c.referencia) ?? [{ referencia: c.referencia, numero: 1, titulo: c.titulo, texto: c.texto, criadoEm: c.criadoEm, pdfFicheiro: null }])
        .sort((a, b) => a.numero - b.numero);
      rel.sequencias[c.ano] = Math.max(rel.sequencias[c.ano] ?? 0, c.numeroAno);
      if (!aplicar) { rel.comunicados.importados++; rel.versoes.importadas += versoes.length; continue; }

      try {
        await importarComunicado(prisma, pdf, storage, c, versoes, utilizadores.get(c.criadoPorEmail ?? '') ?? SYSTEM_USER_ID, pasta, gerarPdf, rel);
        rel.comunicados.importados++;
      } catch (e: any) {
        rel.comunicados.invalidos++;
        rel.erros.push({ ficheiro: 'comunicados.csv', linha, referencia: c.referencia, erros: [e.message] });
      }
    }

    // Destinatários.
    for (const { linha, dados } of ler(pasta, 'destinatarios.csv') ?? []) {
      rel.destinatarios.lidos++;
      const m = mapearDestinatario(dados);
      if (!m.ok) { rel.destinatarios.invalidos++; rel.erros.push({ ficheiro: 'destinatarios.csv', linha, erros: m.erros }); continue; }
      const d = m.valor;
      const existente = await prisma.destinatario.findFirst({
        where: { OR: [...(d.email ? [{ email: { equals: d.email, mode: 'insensitive' as const } }] : []), ...(d.telefone ? [{ telefone: d.telefone }] : [])] },
        include: { listas: true },
      });
      if (existente) {
        const emFalta = d.listas.filter(l => !existente.listas.some(x => x.lista === l));
        if (!emFalta.length) continue;
        rel.destinatarios.atualizados++;
        if (aplicar) await prisma.destinatarioLista.createMany({ data: emFalta.map(lista => ({ destinatarioId: existente.id, lista, ativo: d.ativo })) });
        continue;
      }
      rel.destinatarios.criados++;
      if (aplicar) {
        await prisma.destinatario.create({
          data: {
            nome: d.nome, organizacao: d.organizacao, email: d.email, telefone: d.telefone, interno: d.interno,
            listas: { create: d.listas.map((lista: ListaKey) => ({ lista, ativo: d.ativo })) },
          },
        });
      }
    }

    // A numeração anual continua a partir do maior número migrado.
    if (aplicar) {
      for (const [ano, max] of Object.entries(rel.sequencias)) {
        await prisma.$executeRaw`
          INSERT INTO "ReferenciaSequencia" ("ano", "ultimo") VALUES (${Number(ano)}, ${max})
          ON CONFLICT ("ano") DO UPDATE SET "ultimo" = GREATEST("ReferenciaSequencia"."ultimo", EXCLUDED."ultimo")`;
      }
      await prisma.auditLog.create({
        data: { userId: SYSTEM_USER_ID, acao: 'MIGRAR', entidade: 'Migracao', entidadeId: path.basename(pasta), detalhes: { comunicados: rel.comunicados, versoes: rel.versoes, destinatarios: rel.destinatarios, erros: rel.erros.length } as any },
      });
    }
  } finally {
    rel.fim = new Date().toISOString();
    const ficheiro = path.join(pasta, `relatorio-migracao-${rel.inicio.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(ficheiro, JSON.stringify(rel, null, 2));
    await prisma.$disconnect();
    imprimir(rel, ficheiro);
  }
  process.exit(rel.erros.length ? 1 : 0);
}

async function importarComunicado(prisma: PrismaClient, pdf: PdfService, storage: StorageService, c: ComunicadoMigrado, versoes: VersaoMigrada[], userId: string, pasta: string, gerarPdf: boolean, rel: Relatorio) {
  const ultima = versoes[versoes.length - 1];
  const pdfs = await Promise.all(versoes.map(async v => {
    if (v.pdfFicheiro) {
      const origem = path.resolve(pasta, v.pdfFicheiro);
      if (!origem.startsWith(pasta + path.sep) || !fs.existsSync(origem)) throw new Error(`PDF não encontrado: ${v.pdfFicheiro}`);
      const chave = `pdfs/${c.referencia.replace(/[^A-Za-z0-9-]/g, '_')}_v${versaoLabel(v.numero)}.pdf`;
      await storage.guardar(chave, fs.readFileSync(origem), 'application/pdf');
      rel.versoes.pdfsCopiados++;
      return chave;
    }
    if (!gerarPdf) return null;
    rel.versoes.pdfsGerados++;
    return pdf.generate({
      referencia: c.referencia, versao: v.numero, titulo: v.titulo, texto: v.texto, templateId: c.templateId, areaName: c.areaName,
      eventDateTime: c.eventDateTime, magnitude: c.magnitude, lat: c.lat, lon: c.lon, depth: c.depth, intmax: c.intmax,
      regiaoIntmax: c.regiaoIntmax, local: c.local, dataEmissao: v.criadoEm ?? c.criadoEm ?? new Date(),
    });
  }));

  await prisma.comunicado.create({
    data: {
      referencia: c.referencia, ano: c.ano, numeroAno: c.numeroAno, origem: ComunicadoOrigem.MIGRADO,
      templateId: c.templateId, estado: c.estado, primeiraPagina: c.primeiraPagina, ativo: c.ativo,
      titulo: ultima.titulo, texto: ultima.texto, local: c.local, areaName: c.areaName, eventDateTime: c.eventDateTime,
      lat: c.lat, lon: c.lon, depth: c.depth, magnitude: c.magnitude, intmax: c.intmax, regiaoIntmax: c.regiaoIntmax,
      infoMacrossAdicional: c.infoMacrossAdicional, criadoPorId: userId, ...(c.criadoEm ? { criadoEm: c.criadoEm } : {}),
      versoes: {
        create: versoes.map((v, i) => ({
          numero: v.numero, titulo: v.titulo, texto: v.texto, pdfPath: pdfs[i], criadoPorId: userId,
          ...(v.criadoEm ?? c.criadoEm ? { criadoEm: v.criadoEm ?? c.criadoEm! } : {}),
        })),
      },
    },
  });
  rel.versoes.importadas += versoes.length;
}

function imprimir(r: Relatorio, ficheiro: string) {
  const out = (s: string) => process.stdout.write(`${s}\n`);
  out(`\nMigração SISMOS — ${r.modo === 'aplicado' ? 'APLICADA' : 'SIMULAÇÃO (nada foi gravado; use --aplicar)'}`);
  out(`  Comunicados:   ${r.comunicados.lidos} lidos · ${r.comunicados.importados} ${r.modo === 'aplicado' ? 'importados' : 'a importar'} · ${r.comunicados.existentes} já existentes · ${r.comunicados.invalidos} com erro`);
  out(`  Versões:       ${r.versoes.lidas} lidas · ${r.versoes.importadas} ${r.modo === 'aplicado' ? 'importadas' : 'a importar'} · ${r.versoes.invalidas} com erro · ${r.versoes.pdfsCopiados} PDFs copiados · ${r.versoes.pdfsGerados} gerados`);
  out(`  Destinatários: ${r.destinatarios.lidos} lidos · ${r.destinatarios.criados} novos · ${r.destinatarios.atualizados} com listas acrescentadas · ${r.destinatarios.invalidos} com erro`);
  if (Object.keys(r.sequencias).length) out(`  Numeração:     ${Object.entries(r.sequencias).map(([a, n]) => `${a} → continua após ${n}`).join(' · ')}`);
  for (const e of r.erros.slice(0, 20)) out(`  ! ${e.ficheiro}:${e.linha}${e.referencia ? ` (${e.referencia})` : ''} — ${e.erros.join('; ')}`);
  if (r.erros.length > 20) out(`  … mais ${r.erros.length - 20} erro(s)`);
  out(`  Relatório: ${ficheiro}\n`);
}

main().catch(e => { process.stderr.write(`Migração interrompida: ${e.message}\n`); process.exit(1); });
