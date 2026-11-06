export const SMS_MAX_CHARS = 140;
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ZONA: Record<string, string> = { Continente: 'Europe/Lisbon', Madeira: 'Atlantic/Madeira', 'Açores': 'Atlantic/Azores' };

/*********************************************************************************************************************
* @method       zonaDaArea
* @description  Returns the IANA timezone identifier for the given seismic event area. Mirrors the
*               server-side rule in apps/api/src/modules/delivery/sms.ts so the client can render
*               the same local time as the final SMS without a round-trip.
* @param        area — event area name (Continente, Madeira or Açores), or undefined
* @return       IANA timezone string, defaulting to Europe/Lisbon
*********************************************************************************************************************/
export function zonaDaArea(area?: string) {
  return (area && ZONA[area]) || 'Europe/Lisbon';
}

/*********************************************************************************************************************
* @method       partes
* @description  Decomposes a Date into its constituent calendar and time parts as observed in the given
*               IANA timezone, using Intl.DateTimeFormat with h23 hour cycle. Used by construirSms
*               and by the event-detail form to display local and UTC times side by side.
* @param        date — UTC Date to decompose
* @param        zone — IANA timezone identifier (e.g. "Europe/Lisbon")
* @return       Object with string parts: y (year), mo (month 01-12), d (day 01-31), h (hour), mi (minute)
*********************************************************************************************************************/
export function partes(date: Date, zone: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
}

/*********************************************************************************************************************
* @method       semAcentos
* @description  Strips diacritical marks via NFD normalisation and removes any character outside the
*               printable ASCII range (0x20–0x7E), producing a 7-bit ASCII string compatible with
*               the GSM-7 encoding used by the SMSExpress MEO gateway.
* @param        s — input string potentially containing accented or non-ASCII characters
* @return       ASCII-only string with diacritics stripped
*********************************************************************************************************************/
function semAcentos(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
}

/*********************************************************************************************************************
* @method       construirSms
* @description  Builds the preliminary seismic bulletin SMS message from event data, applying the
*               SMS_MAX_CHARS (140) character limit. The epicentre description is truncated with an
*               ellipsis when it would overflow the budget. All text is reduced to printable ASCII via
*               semAcentos before assembling the final string.
* @param        d — event data with optional areaName, eventDateTime, local and magnitude fields
* @return       SMS-ready string of at most SMS_MAX_CHARS characters
* @uses         zonaDaArea, partes, semAcentos
*********************************************************************************************************************/
export function construirSms(d: { areaName?: string; eventDateTime?: string; local?: string; magnitude?: string | number }): string {
  const area = d.areaName ?? '';
  const dt = d.eventDateTime ? new Date(d.eventDateTime) : null;
  let data = '';
  if (dt && !Number.isNaN(dt.getTime())) {
    const p = partes(dt, zonaDaArea(area));
    data = ` Data: ${p.y}${MESES[Number(p.mo) - 1]}${p.d} ${p.h}:${p.mi}`;
  }
  const mag = d.magnitude !== undefined && d.magnitude !== '' && !Number.isNaN(Number(d.magnitude)) ? ` Magnitude: ${Number(d.magnitude).toFixed(1)}` : '';
  const inicio = semAcentos(`Inf. Prelim. Sismo: ${area}${data}`);
  const fim = semAcentos(mag);
  let local = semAcentos(d.local ?? '').replace(/\s+/g, ' ').trim();
  if (!local) return `${inicio}${fim}`.slice(0, SMS_MAX_CHARS);
  const espaco = SMS_MAX_CHARS - `${inicio} Epicentro: ${fim}`.length;
  if (local.length > espaco) local = espaco > 3 ? `${local.slice(0, espaco - 3).trimEnd()}...` : '';
  return (local ? `${inicio} Epicentro: ${local}${fim}` : `${inicio}${fim}`).slice(0, SMS_MAX_CHARS);
}
