import { ComunicadoEstado, ListaKey } from '@prisma/client';

/** Resultado da validação de uma linha do ficheiro intermédio. */
export type Mapeado<T> = { ok: true; valor: T; erros?: undefined } | { ok: false; valor?: undefined; erros: string[] };

export interface ComunicadoMigrado {
  referencia: string;
  ano: number;
  numeroAno: number;
  templateId: string;
  estado: ComunicadoEstado;
  areaName: string;
  local: string | null;
  eventDateTime: Date | null;
  lat: number | null;
  lon: number | null;
  depth: number | null;
  magnitude: number | null;
  intmax: string | null;
  regiaoIntmax: string | null;
  infoMacrossAdicional: string | null;
  titulo: string;
  texto: string;
  primeiraPagina: boolean;
  ativo: boolean;
  criadoEm: Date | null;
  criadoPorEmail: string | null;
}

export interface VersaoMigrada {
  referencia: string;
  numero: number;
  titulo: string;
  texto: string;
  criadoEm: Date | null;
  pdfFicheiro: string | null;
}

export interface DestinatarioMigrado {
  nome: string;
  organizacao: string | null;
  email: string | null;
  telefone: string | null;
  listas: ListaKey[];
  interno: boolean;
  ativo: boolean;
}

const ESTADOS: Record<string, ComunicadoEstado> = {
  rascunho: 'RASCUNHO', pendente: 'PENDENTE', aprovado: 'APROVADO', enviado: 'ENVIADO',
  cancelado: 'CANCELADO', arquivado: 'ARQUIVADO', ativo: 'ENVIADO', publicado: 'ENVIADO', inativo: 'ARQUIVADO',
};
const AREAS: Record<string, string> = { continente: 'Continente', acores: 'Açores', 'açores': 'Açores', madeira: 'Madeira' };
const LISTAS = Object.values(ListaKey) as string[];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONE = /^\+?[0-9 ]{9,20}$/;

const vazio = (v?: string) => v == null || v.trim() === '';
const texto = (v?: string) => (vazio(v) ? null : v!.trim());

function numero(v: string | undefined, campo: string, erros: string[]): number | null {
  if (vazio(v)) return null;
  const n = Number(v!.replace(',', '.'));
  if (Number.isNaN(n)) { erros.push(`${campo} não é numérico: "${v}"`); return null; }
  return n;
}

function booleano(v: string | undefined, omissao: boolean): boolean {
  if (vazio(v)) return omissao;
  return ['1', 'true', 'sim', 's', 'yes', 'y', 'verdadeiro', 'x'].includes(v!.trim().toLowerCase());
}

function data(v: string | undefined, campo: string, erros: string[]): Date | null {
  if (vazio(v)) return null;
  const s = v!.trim();
  // Aceita ISO (2026-09-06T10:15:36Z), "2026-09-06 10:15:36" (tomado como UTC) e "06-09-2026 10:15" / "06/09/2026 10:15".
  const pt = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const d = pt
    ? new Date(Date.UTC(+pt[3], +pt[2] - 1, +pt[1], +(pt[4] ?? 0), +(pt[5] ?? 0), +(pt[6] ?? 0)))
    : new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) { erros.push(`${campo} inválida: "${v}"`); return null; }
  return d;
}

/** Ano e número anual: colunas explícitas ou extraídos do fim da referência (p.ex. "SISM-2019-0042", "042/2019"). */
function anoNumero(d: Record<string, string>, erros: string[]): [number, number] | null {
  const ano = numero(d.ano, 'ano', erros);
  const num = numero(d.numero, 'numero', erros);
  if (ano != null && num != null) return [ano, num];
  const r = d.referencia ?? '';
  const m1 = r.match(/(\d{4})\D+(\d{1,6})$/);
  if (m1) return [+m1[1], +m1[2]];
  const m2 = r.match(/^(\d{1,6})\D+(\d{4})$/);
  if (m2) return [+m2[2], +m2[1]];
  erros.push('ano/numero em falta e não foi possível extraí-los da referência');
  return null;
}

/** Valida e converte uma linha de comunicados.csv. */
export function mapearComunicado(d: Record<string, string>): Mapeado<ComunicadoMigrado> {
  const erros: string[] = [];
  const referencia = texto(d.referencia);
  if (!referencia) erros.push('referencia em falta');
  else if (referencia.length > 64) erros.push('referencia demasiado longa');
  const an = anoNumero(d, erros);
  if (an && (an[0] < 1990 || an[0] > 2100)) erros.push(`ano fora do intervalo: ${an[0]}`);

  const templateId = vazio(d.template_id) ? '0000' : d.template_id.trim().padStart(4, '0');
  if (!/^000[0-7]$/.test(templateId)) erros.push(`template_id desconhecido: "${d.template_id}"`);
  const estado = vazio(d.estado) ? 'ENVIADO' : ESTADOS[d.estado.trim().toLowerCase()];
  if (!estado) erros.push(`estado desconhecido: "${d.estado}"`);
  const areaChave = (d.area ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const areaName = vazio(d.area) ? 'Continente' : AREAS[areaChave];
  if (!areaName) erros.push(`area desconhecida: "${d.area}"`);
  const titulo = texto(d.titulo);
  const corpo = texto(d.texto);
  if (!titulo) erros.push('titulo em falta');
  if (!corpo) erros.push('texto em falta');

  const valor = {
    referencia: referencia ?? '', ano: an?.[0] ?? 0, numeroAno: an?.[1] ?? 0, templateId, estado: estado ?? 'ENVIADO',
    areaName: areaName ?? 'Continente', local: texto(d.local),
    eventDateTime: data(d.data_evento_utc, 'data_evento_utc', erros),
    lat: numero(d.lat, 'lat', erros), lon: numero(d.lon, 'lon', erros),
    depth: numero(d.profundidade, 'profundidade', erros), magnitude: numero(d.magnitude, 'magnitude', erros),
    intmax: texto(d.intmax), regiaoIntmax: texto(d.regiao_intmax), infoMacrossAdicional: texto(d.info_macross),
    titulo: titulo ?? '', texto: corpo ?? '',
    primeiraPagina: booleano(d.primeira_pagina, false), ativo: booleano(d.ativo, true),
    criadoEm: data(d.criado_em, 'criado_em', erros), criadoPorEmail: texto(d.criado_por_email)?.toLowerCase() ?? null,
  } satisfies ComunicadoMigrado;
  if (valor.lat != null && (valor.lat < -90 || valor.lat > 90)) erros.push('lat fora do intervalo');
  if (valor.lon != null && (valor.lon < -180 || valor.lon > 180)) erros.push('lon fora do intervalo');
  return erros.length ? { ok: false, erros } : { ok: true, valor };
}

/** Valida e converte uma linha de versoes.csv. */
export function mapearVersao(d: Record<string, string>): Mapeado<VersaoMigrada> {
  const erros: string[] = [];
  const referencia = texto(d.referencia);
  if (!referencia) erros.push('referencia em falta');
  const n = numero(d.numero, 'numero', erros);
  if (n == null || n < 1 || !Number.isInteger(n)) erros.push('numero de versão inválido');
  const titulo = texto(d.titulo), corpo = texto(d.texto);
  if (!titulo) erros.push('titulo em falta');
  if (!corpo) erros.push('texto em falta');
  const pdf = texto(d.pdf_ficheiro);
  if (pdf && (pdf.includes('..') || /^([a-zA-Z]:|[\\/])/.test(pdf))) erros.push('pdf_ficheiro tem de ser um caminho relativo dentro da pasta');
  const valor: VersaoMigrada = { referencia: referencia ?? '', numero: n ?? 1, titulo: titulo ?? '', texto: corpo ?? '', criadoEm: data(d.criado_em, 'criado_em', erros), pdfFicheiro: pdf };
  return erros.length ? { ok: false, erros } : { ok: true, valor };
}

/** Valida e converte uma linha de destinatarios.csv. */
export function mapearDestinatario(d: Record<string, string>): Mapeado<DestinatarioMigrado> {
  const erros: string[] = [];
  const nome = texto(d.nome);
  if (!nome) erros.push('nome em falta');
  const email = texto(d.email)?.toLowerCase() ?? null;
  const telefone = texto(d.telefone);
  if (email && !EMAIL.test(email)) erros.push(`email inválido: "${email}"`);
  if (telefone && !TELEFONE.test(telefone)) erros.push(`telefone inválido: "${telefone}"`);
  if (!email && !telefone) erros.push('sem email nem telefone');
  const listas = (d.listas ?? '').split(/[|,;\s]+/).map(l => l.trim().toUpperCase()).filter(Boolean);
  const invalidas = listas.filter(l => !LISTAS.includes(l));
  if (invalidas.length) erros.push(`listas desconhecidas: ${invalidas.join(', ')}`);
  if (!listas.length) erros.push('sem listas');
  const valor: DestinatarioMigrado = {
    nome: nome ?? '', organizacao: texto(d.organizacao), email, telefone,
    listas: [...new Set(listas.filter(l => LISTAS.includes(l)))] as ListaKey[],
    interno: booleano(d.interno, false), ativo: booleano(d.ativo, true),
  };
  return erros.length ? { ok: false, erros } : { ok: true, valor };
}
