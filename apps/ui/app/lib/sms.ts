// Espelho da regra do servidor (apps/api/src/modules/delivery/sms.ts) para pré-visualização.
export const SMS_MAX_CHARS = 140;
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ZONA: Record<string, string> = { Continente: 'Europe/Lisbon', Madeira: 'Atlantic/Madeira', 'Açores': 'Atlantic/Azores' };

export function zonaDaArea(area?: string) {
  return (area && ZONA[area]) || 'Europe/Lisbon';
}

/** Partes da data numa zona IANA. */
export function partes(date: Date, zone: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
}

function semAcentos(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
}

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
