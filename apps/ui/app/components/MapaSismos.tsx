'use client';
import { useEffect, useRef } from 'react';

// Esri Light Gray Canvas — gratuito, sem API key
const TILE_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const TILE_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, DeLorme, NAVTEQ';

// Portugal Continental + Madeira + Açores
const PT_BOUNDS: [[number, number], [number, number]] = [[28.0, -33.0], [43.5, -5.5]];

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

      L.tileLayer(TILE_BASE, { attribution: TILE_ATTR, maxZoom: 16 }).addTo(map);
      L.tileLayer(TILE_LABELS, { maxZoom: 16, opacity: 1 }).addTo(map);

      const valid = pontos.filter(p => p.lat != null && p.lon != null);

      // View inicial garantida — Leaflet precisa de um setView antes do fitBounds
      // para funcionar correctamente quando o container acabou de montar.
      map.setView([39.5, -8.0], 6);

      if (!valid.length) return;

      valid.forEach(p => {
        const mag = p.magnitude != null ? Number(p.magnitude) : undefined;
        const color = magColor(mag);
        // Raio em metros — cresce automaticamente com o zoom
        const radM = mag == null ? 6000
          : mag >= 6 ? 28000
          : mag >= 5 ? 18000
          : mag >= 4 ? 12000
          : mag >= 3 ? 8000
          : 5000;

        if (pulse) {
          // Anéis de propagação (página de detalhe)
          [radM * 2.5, radM * 1.4].forEach((rad, i) => L.circle([p.lat, p.lon], {
            radius: rad, fillColor: color, color: color,
            weight: 1, opacity: 0.22 - i * 0.07, fillOpacity: 0.04,
          }).addTo(map));
        }

        L.circle([p.lat, p.lon], {
          radius: radM, fillColor: color,
          color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.85,
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
          { permanent: false, direction: 'top' }
        ).addTo(map);
      });

      // Ajustar vista após um tick para garantir que o container tem dimensões
      setTimeout(() => {
        if (!active) return;
        map.invalidateSize();
        if (valid.length === 1) {
          map.setView([valid[0].lat, valid[0].lon], pulse ? 9 : 8);
        } else {
          const lons = valid.map(p => p.lon);
          const spanLon = Math.max(...lons) - Math.min(...lons);
          if (spanLon > 10) {
            map.fitBounds(PT_BOUNDS, { padding: [24, 24] });
          } else {
            const bounds = L.latLngBounds(valid.map((p: any) => [p.lat, p.lon]));
            map.fitBounds(bounds.pad(0.35), { maxZoom: 9 });
          }
        }
      }, 80);
    }

    loadLeaflet(init);
    return () => { active = false; mapRef.current?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pKey]);

  return <div ref={containerRef} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden', zIndex: 0, position: 'relative' }} />;
}
