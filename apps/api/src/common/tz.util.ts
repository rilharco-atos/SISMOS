export const TZ_LISBOA = 'Europe/Lisbon';

const ZONA_POR_AREA: Record<string, string> = {
  Continente: 'Europe/Lisbon',
  Madeira: 'Atlantic/Madeira',
  'Açores': 'Atlantic/Azores',
};

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/*********************************************************************************************************************
* @method       zoneForArea
* @description  Returns the IANA timezone identifier for the given event area. Defaults to
*               Europe/Lisbon (mainland Portugal) when the area is absent or not in the map.
* @param        area — event area name (Continente, Madeira or Açores), or null/undefined
* @return       IANA timezone string
*********************************************************************************************************************/
export function zoneForArea(area?: string | null): string {
  return (area && ZONA_POR_AREA[area]) || TZ_LISBOA;
}

function partsIn(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

function offsetMs(ts: number, zone: string): number {
  const p = partsIn(new Date(ts), zone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000;
}

/*********************************************************************************************************************
* @method       wallTimeToUtc
* @description  Converts a local wall-clock datetime string (ISO format without timezone, e.g.
*               "2026-09-06T11:15:36") interpreted in the given IANA timezone to a UTC Date.
*               When the string already carries a timezone offset (Z or ±hh:mm) it is respected
*               as-is. Handles DST transitions with a two-pass offset correction.
* @param        value — ISO datetime string, with or without timezone offset
* @param        zone — IANA timezone identifier (e.g. "Europe/Lisbon")
* @return       UTC Date; an invalid Date (NaN) when parsing fails
*********************************************************************************************************************/
export function wallTimeToUtc(value: string, zone: string): Date {
  const v = value.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(v)) return new Date(v);
  const asUtc = Date.parse(`${v}Z`);
  if (Number.isNaN(asUtc)) return new Date(NaN);
  let utc = asUtc - offsetMs(asUtc, zone);
  const second = offsetMs(utc, zone);
  if (asUtc - second !== utc) utc = asUtc - second;
  return new Date(utc);
}

/*********************************************************************************************************************
* @method       formatInZone
* @description  Formats a UTC Date as a localised string in the given IANA timezone.
*               Supported format tokens: 'dd-mm-aaaa' (date only), 'hh:mm' (time only),
*               'sms' (compact SMS format: 2026Set08 16:41), 'longo' (08-09-2026 16:41).
* @param        date — UTC Date to format
* @param        zone — IANA timezone identifier
* @param        fmt — output format token
* @return       Formatted string in the requested format
*********************************************************************************************************************/
export function formatInZone(date: Date, zone: string, fmt: 'dd-mm-aaaa' | 'hh:mm' | 'sms' | 'longo'): string {
  const p = partsIn(date, zone);
  const dd = String(p.d).padStart(2, '0');
  const mm = String(p.mo).padStart(2, '0');
  const hh = String(p.h).padStart(2, '0');
  const mi = String(p.mi).padStart(2, '0');
  switch (fmt) {
    case 'dd-mm-aaaa': return `${dd}-${mm}-${p.y}`;
    case 'hh:mm': return `${hh}:${mi}`;
    case 'sms': return `${p.y}${MESES_CURTOS[p.mo - 1]}${dd} ${hh}:${mi}`;
    case 'longo': return `${dd}-${mm}-${p.y} ${hh}:${mi}`;
  }
}

/*********************************************************************************************************************
* @method       anoLisboa
* @description  Returns the current calendar year in the Europe/Lisbon timezone, used to generate
*               the annual sequence number in bulletin references.
* @param        date — reference date (defaults to the current time)
* @return       Four-digit year as an integer
*********************************************************************************************************************/
export function anoLisboa(date = new Date()): number {
  return partsIn(date, TZ_LISBOA).y;
}
