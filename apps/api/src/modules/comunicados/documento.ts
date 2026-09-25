import * as path from 'path';
import { formatInZone, zoneForArea } from '../../common/tz.util';
import { TEMPLATES, isTemplateId } from './templates';

export const LOGO_PATH = path.resolve('assets', 'ipma-logo.png');
export const EMISSOR = 'Instituto Português do Mar e da Atmosfera, I.P.';

/** Conteúdo de um comunicado tal como aparece no PDF e no corpo HTML do email. */
export interface DocumentoComunicado {
  referencia: string;
  versao: number;
  titulo: string;
  texto: string;
  templateId: string;
  areaName: string;
  eventDateTime?: Date | null;
  magnitude?: number | null;
  lat?: number | null;
  lon?: number | null;
  depth?: number | null;
  intmax?: string | null;
  regiaoIntmax?: string | null;
  local?: string | null;
  imagemUrl?: string | null;
  tecnico?: string | null;
  dataEmissao: Date;
}

/** Número de versão com 3 dígitos (001, 002, …), como no sistema atual. */
export function versaoLabel(n: number): string {
  return String(n).padStart(3, '0');
}

export function templateLabel(id: string): string {
  return isTemplateId(id) ? `${id} — ${TEMPLATES[id].label}` : id;
}

function coord(v: number, pos: string, neg: string) {
  return `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
}

/** Linhas "rótulo: valor" do bloco de dados do evento. Campos sem valor são omitidos. */
export function linhasEvento(d: DocumentoComunicado): [string, string][] {
  const zone = zoneForArea(d.areaName);
  const n = (v: unknown) => v != null && String(v).trim() !== '' && !Number.isNaN(Number(v));
  const linhas: [string, string | null][] = [
    ['Data e hora', d.eventDateTime
      ? `${formatInZone(d.eventDateTime, zone, 'longo')} (hora local) · ${formatInZone(d.eventDateTime, 'UTC', 'longo')} UTC`
      : null],
    ['Epicentro', d.local || null],
    ['Área', d.areaName || null],
    ['Coordenadas', n(d.lat) && n(d.lon) ? `${coord(Number(d.lat), 'N', 'S')} / ${coord(Number(d.lon), 'E', 'W')}` : null],
    ['Profundidade', n(d.depth) ? `${Number(d.depth).toFixed(1)} km` : null],
    ['Magnitude', n(d.magnitude) ? `${Number(d.magnitude).toFixed(1)} (Richter)` : null],
    ['Intensidade máxima', d.intmax || null],
    ['Região de intensidade máxima', d.regiaoIntmax || null],
  ];
  return linhas.filter((l): l is [string, string] => l[1] != null);
}

export function subtituloDocumento(d: DocumentoComunicado): string {
  return `${d.referencia} · v${versaoLabel(d.versao)} · Emitido ${formatInZone(d.dataEmissao, 'UTC', 'longo')} UTC`;
}

/** Tipo de imagem pelos magic bytes (apenas PNG e JPEG são embebidos). */
export function tipoImagem(buf: Buffer): 'png' | 'jpeg' | null {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}
