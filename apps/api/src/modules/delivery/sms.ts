import { formatInZone, zoneForArea } from '../../common/tz.util';

export const SMS_MAX_CHARS = 140;

/** Remove acentos e símbolos fora do ASCII imprimível (regra do protocolo SMS do IPMA). */
export function removerAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
}

export interface SmsDados {
  areaName?: string | null;
  eventDateTime?: Date | null;
  local?: string | null;
  magnitude?: number | string | null;
}

/**
 * Mensagem SMS automática, não editável, no formato do exemplo fornecido pelo IPMA:
 * "Inf. Prelim. Sismo: Acores Data: 2026Set08 16:41 Epicentro: <local> Magnitude: 3.0".
 * Se exceder o limite, é o epicentro que é encurtado (a magnitude nunca é cortada).
 */
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
