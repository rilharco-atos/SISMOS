'use client';
import { useEffect, useRef } from 'react';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function magColor(m?: number): string {
  if (!m) return '#6366F1';
  if (m >= 6) return '#DC2626';
  if (m >= 5) return '#EA580C';
  if (m >= 4) return '#D97706';
  if (m >= 3) return '#22C55E';
  return '#3B82F6';
}

export interface PontoSismo {
  id?: string;
  referencia?: string;
  lat: number;
  lon: number;
  magnitude?: number | string;
  local?: string;
  areaName?: string;
  titulo?: string;
  estado?: string;
  eventDateTime?: string;
}

const loadedRef = { done: false, callbacks: [] as (() => void)[] };

function loadLeaflet(cb: () => void) {
  if ((window as any).L) { cb(); return; }
  loadedRef.callbacks.push(cb);
  if (loadedRef.callbacks.length > 1) return;

  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);
  }

  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  s.onload = () => { loadedRef.callbacks.forEach(fn => fn()); loadedRef.callbacks = []; };
  document.head.appendChild(s);
}

export function MapaSismos({
  pontos,
  height = 380,
  pulse = false,
}: {
  pontos: PontoSismo[];
  height?: number;
  pulse?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const pKey = JSON.stringify(pontos.map(p => `${p.lat},${p.lon},${p.magnitude}`));

  useEffect(() => {
    if (!containerRef.current) return;
    let active = true;

    function init() {
      if (!active || !containerRef.current) return;
      const L = (window as any).L;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(containerRef.current, { zoomControl: true });
      mapRef.current = map;

      L.tileLayer(TILE_URL, { attribution: TILE_ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(map);

      const valid = pontos.filter(p => p.lat != null && p.lon != null);
      if (!valid.length) { map.setView([39.5, -8.0], 6); return; }

      valid.forEach(p => {
        const mag = p.magnitude != null ? Number(p.magnitude) : undefined;
        const color = magColor(mag);
        const r = Math.max(7, Math.min(22, (mag || 3) * 4));

        L.circleMarker([p.lat, p.lon], {
          radius: r, fillColor: color,
          color: '#fff', weight: 2.5, opacity: 1, fillOpacity: 0.88,
        }).bindTooltip(
          `<div class="sismo-tip">` +
          `<div class="sismo-tip-ref">${p.referencia ?? ''}</div>` +
          `<div class="sismo-tip-local">${p.titulo ?? p.local ?? p.areaName ?? ''}</div>` +
          `<div class="sismo-tip-row">` +
          `<span style="color:${color};font-weight:700">● Mag ${mag != null ? mag.toFixed(1) : '—'} ML</span>` +
          (p.eventDateTime ? `<span class="sismo-tip-dt">${new Date(p.eventDateTime).toLocaleDateString('pt-PT')}</span>` : '') +
          `</div>` +
          (p.areaName ? `<div class="sismo-tip-area">${p.areaName}</div>` : '') +
          `</div>`,
          { permanent: false, direction: 'top', offset: [0, -r - 4] }
        ).addTo(map);

        if (pulse) {
          [30000, 12000].forEach((rad, i) => L.circle([p.lat, p.lon], {
            radius: rad, fillColor: color, color: color,
            weight: 1.5 - i * 0.5, opacity: 0.35 - i * 0.1, fillOpacity: 0.07 - i * 0.02,
          }).addTo(map));
        }
      });

      if (valid.length === 1) {
        map.setView([valid[0].lat, valid[0].lon], pulse ? 9 : 8);
      } else {
        const bounds = (window as any).L.latLngBounds(valid.map(p => [p.lat, p.lon]));
        map.fitBounds(bounds.pad(0.3), { maxZoom: 10 });
      }
    }

    loadLeaflet(init);
    return () => { active = false; mapRef.current?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pKey]);

  return <div ref={containerRef} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden', zIndex: 0, position: 'relative' }} />;
}
