export const TZ_LISBOA = 'Europe/Lisbon';

const ZONA_POR_AREA: Record<string, string> = {
  Continente: 'Europe/Lisbon',
  Madeira: 'Atlantic/Madeira',
  'Açores': 'Atlantic/Azores',
};

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Fuso horário IANA correspondente à área do evento (Continente por omissão). */
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

/**
 * Converte uma data/hora ISO sem fuso ("2026-09-06T11:15:36") interpretada na zona indicada para UTC.
 * Se a string já trouxer fuso (Z ou ±hh:mm) é respeitado.
 */
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

/** Formata uma data numa zona: 'dd-mm-aaaa', 'hh:mm', 'sms' (2026Set08 16:41) ou 'longo' (08-09-2026 16:41). */
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

/** Ano civil corrente na hora de Lisboa (usado na numeração anual das referências). */
export function anoLisboa(date = new Date()): number {
  return partsIn(date, TZ_LISBOA).y;
}
