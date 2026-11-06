import * as path from 'path';
import { formatInZone, zoneForArea } from '../../common/tz.util';
import { TEMPLATES, isTemplateId } from './templates';

export const LOGO_PATH = path.resolve('assets', 'ipma-logo.png');
export const EMISSOR = 'Instituto Português do Mar e da Atmosfera, I.P.';

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

/*********************************************************************************************************************
* @method       versaoLabel
* @description  Formats a version number as a zero-padded 3-digit string matching the IPMA convention.
* @param        n — version number (1 → "001", 12 → "012")
* @return       Zero-padded 3-digit string
*********************************************************************************************************************/
export function versaoLabel(n: number): string {
  return String(n).padStart(3, '0');
}

/*********************************************************************************************************************
* @method       templateLabel
* @description  Returns the display label for a template id, combining the id with the template's
*               descriptive label. Falls back to the raw id when not found in the catalogue.
* @param        id — template identifier string
* @return       Formatted label string
*********************************************************************************************************************/
export function templateLabel(id: string): string {
  return isTemplateId(id) ? `${id} — ${TEMPLATES[id].label}` : id;
}

function coord(v: number, pos: string, neg: string) {
  return `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
}

/*********************************************************************************************************************
* @method       linhasEvento
* @description  Builds the ordered list of event data label-value pairs used in the PDF and email body.
*               Fields without a value are omitted; the date is formatted in both local time and UTC.
* @param        d — DocumentoComunicado with all event fields
* @return       Array of [label, value] string tuples with no null entries
* @uses         zoneForArea, formatInZone
*********************************************************************************************************************/
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

/*********************************************************************************************************************
* @method       subtituloDocumento
* @description  Builds the document subtitle line shown under the title in the PDF and email header:
*               "SISM-2026-0001 · v001 · Emitido 30 Oct 2026 14:00 UTC".
* @param        d — DocumentoComunicado with referencia, versao and dataEmissao
* @return       Formatted subtitle string
* @uses         versaoLabel, formatInZone
*********************************************************************************************************************/
export function subtituloDocumento(d: DocumentoComunicado): string {
  return `${d.referencia} · v${versaoLabel(d.versao)} · Emitido ${formatInZone(d.dataEmissao, 'UTC', 'longo')} UTC`;
}

/*********************************************************************************************************************
* @method       tipoImagem
* @description  Detects the image type of a Buffer by reading the magic bytes. Only PNG and JPEG are
*               supported for embedding in the bulletin PDF and email.
* @param        buf — raw image buffer
* @return       'png', 'jpeg', or null when the format is not recognised
*********************************************************************************************************************/
export function tipoImagem(buf: Buffer): 'png' | 'jpeg' | null {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}
