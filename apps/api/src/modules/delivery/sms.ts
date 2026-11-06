import { formatInZone, zoneForArea } from '../../common/tz.util';

export const SMS_MAX_CHARS = 140;

/*********************************************************************************************************************
* @method       removerAcentos
* @description  Strips diacritics and non-ASCII printable characters from a string. Required by the
*               IPMA SMS protocol which only allows ASCII printable characters (0x20–0x7e).
* @param        s — input string with potential accented or non-ASCII characters
* @return       ASCII-safe string with diacritics removed
*********************************************************************************************************************/
export function removerAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
}

export interface SmsDados {
  areaName?: string | null;
  eventDateTime?: Date | null;
  local?: string | null;
  magnitude?: number | string | null;
}

/*********************************************************************************************************************
* @method       construirSms
* @description  Builds the automatic SMS message in the IPMA-specified format:
*               "Inf. Prelim. Sismo: Acores Data: 2026Set08 16:41 Epicentro: <local> Magnitude: 3.0".
*               The epicentre is truncated if the message exceeds 140 characters; magnitude is never cut.
* @param        d — SmsDados with area name, event date, epicentre and magnitude
* @return       ASCII-safe SMS string of at most 140 characters
* @uses         removerAcentos, formatInZone, zoneForArea
*********************************************************************************************************************/
export function construirSms(d: SmsDados): string {
  const area = d.areaName ?? '';
  const data = d.eventDateTime ? ` Data: ${formatInZone(new Date(d.eventDateTime), zoneForArea(area), 'sms')}` : '';
  const mag = d.magnitude != null && d.magnitude !== '' ? ` Magnitude: ${Number(d.magnitude).toFixed(1)}` : '';
  const inicio = removerAcentos(`Inf. Prelim. Sismo: ${area}${data}`);
  const fim = removerAcentos(mag);
  let local = removerAcentos(d.local ?? '').replace(/\s+/g, ' ').trim();
  if (!local) return `${inicio}${fim}`.slice(0, SMS_MAX_CHARS);

  const fixo = `${inicio} Epicentro: ${fim}`.length;
  const espaco = SMS_MAX_CHARS - fixo;
  if (local.length > espaco) local = espaco > 3 ? `${local.slice(0, espaco - 3).trimEnd()}...` : '';
  return (local ? `${inicio} Epicentro: ${local}${fim}` : `${inicio}${fim}`).slice(0, SMS_MAX_CHARS);
}
