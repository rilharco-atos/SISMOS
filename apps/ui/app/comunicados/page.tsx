'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { comunicadosApi, abrirPdf } from '../lib/api';
import { MapaSismos } from '../components/MapaSismos';

const ESTADO_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho', PENDENTE: 'Pendente', APROVADO: 'Ativo',
  ENVIADO: 'Enviado', CANCELADO: 'Cancelado', ARQUIVADO: 'Arquivado',
};
const ESTADO_BADGE: Record<string, string> = {
  RASCUNHO: 'badge', PENDENTE: 'badge badge-warning', APROVADO: 'badge badge-success',
  ENVIADO: 'badge badge-info', CANCELADO: 'badge badge-danger', ARQUIVADO: 'badge',
};
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/*********************************************************************************************************************
* @method       Svg
* @description  Minimal SVG wrapper that renders a viewBox="0 0 24 24" element around any child
*               path or shape nodes, used for inline icon rendering throughout the page.
* @param        children — SVG child elements (path, polyline, circle, line, etc.)
* @return       SVG element
*********************************************************************************************************************/
function Svg({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24">{children}</svg>;
}

/*********************************************************************************************************************
* @method       ultimosMeses
* @description  Generates an ordered list of the last N calendar months in UTC, from most recent to
*               oldest, each as a { value, label } pair for use in filter dropdowns.
* @param        n — number of months to generate (e.g. 24)
* @return       array of { value: "YYYY-MM", label: "Mês YYYY" } objects, most recent first
*********************************************************************************************************************/
function ultimosMeses(n: number) {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push({ value: `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MESES_LONGOS[m.getUTCMonth()]} ${m.getUTCFullYear()}` });
  }
  return out;
}

/*********************************************************************************************************************
* @method       dataUtc
* @description  Formats an ISO 8601 date string into a day label and an HH:MM UTC time label using
*               the UTC clock, suitable for display in bulletin tables where event times are always UTC.
* @param        d — optional ISO 8601 date string
* @return       object with dia (e.g. "15 Out 2026") and hora (e.g. "14:32 UTC") fields
*********************************************************************************************************************/
function dataUtc(d?: string) {
  if (!d) return { dia: '—', hora: '' };
  const x = new Date(d);
  return {
    dia: `${String(x.getUTCDate()).padStart(2, '0')} ${MESES[x.getUTCMonth()]} ${x.getUTCFullYear()}`,
    hora: `${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')} UTC`,
  };
}

/*********************************************************************************************************************
* @method       Entrega
* @description  Renders a compact delivery status badge for a set of email or SMS dispatch records.
*               Shows a failure count in red when any dispatch failed, a success count in green when
*               all succeeded, or a dash when there are no dispatch records.
* @param        envios — array of delivery records with totalEnviado and totalFalha fields
* @return       JSX span element with coloured delivery summary
*********************************************************************************************************************/
function Entrega({ envios }: { envios: any[] }) {
  if (!envios.length) return <span className="delivery-na">—</span>;
  const enviados = envios.reduce((s, e) => s + (e.totalEnviado ?? 0), 0);
  const falhas = envios.reduce((s, e) => s + (e.totalFalha ?? 0), 0);
  if (falhas > 0) return <span className="delivery-fail" title={`${enviados} enviados, ${falhas} falhas`}>✗ {falhas}</span>;
  return <span className="delivery-ok">✓ {enviados}</span>;
}

/*********************************************************************************************************************
* @method       exportarCsv
* @description  Generates a UTF-8 BOM CSV file from the current filtered bulletin list and triggers a
*               browser download. Columns: Referência, Template, Área, Estado, Título, Local,
*               Magnitude, Data evento (UTC), Versões. Fields are double-quote escaped.
* @param        items — array of bulletin objects from the API
* @return       void — triggers a file download as a side effect
*********************************************************************************************************************/
function exportarCsv(items: any[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [
    ['Referência', 'Template', 'Área', 'Estado', 'Título', 'Local', 'Magnitude', 'Data evento (UTC)', 'Versões'].map(esc).join(';'),
    ...items.map(i => [i.referencia, i.templateId, i.areaName, ESTADO_LABELS[i.estado] ?? i.estado, i.titulo, i.local, i.magnitude, i.eventDateTime, i.versoes?.length ?? 0].map(esc).join(';')),
  ];
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `comunicados_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/*********************************************************************************************************************
* @method       ComunicadosPage
* @description  Full bulletin archive page with server-side filtering by free-text search, state,
*               area and month, client-side pagination, CSV export, and an optional seismic event map
*               modal. Debounces the search input by 300 ms to avoid excessive API calls.
* @return       JSX element — the bulletins list page
* @uses         useRouter, comunicadosApi, abrirPdf, MapaSismos, ultimosMeses, dataUtc, Entrega, exportarCsv
*********************************************************************************************************************/
export default function ComunicadosPage() {
  const router = useRouter();
  const meses = useMemo(() => ultimosMeses(24), []);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [area, setArea] = useState('');
  const [mes, setMes] = useState('');
  const [showMapa, setShowMapa] = useState(false);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (estado) params.set('estado', estado);
      if (area) params.set('areaName', area);
      if (mes) params.set('mes', mes);
      const list = await comunicadosApi.list(params.toString());
      setItems(list);
      setPagina(1);
    } catch { router.push('/login'); }
    setLoading(false);
  }, [search, estado, area, mes, router]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <span className="eyebrow">Arquivo</span>
          <h1 className="page-title">Comunicados</h1>
          <p className="page-sub">Todos os comunicados sismológicos · {loading ? '…' : items.length} registo{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMapa(true)} disabled={!items.some((i: any) => i.lat != null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Ver Mapa
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportarCsv(items)} disabled={!items.length}>Exportar CSV</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search">
          <Svg><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>
          <input className="input" type="search" placeholder="Pesquisar referência, título, local..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos os estados</option>
          {Object.entries(ESTADO_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="select" value={area} onChange={e => setArea(e.target.value)}>
          <option value="">Todas as áreas</option>
          <option value="Continente">Continente</option>
          <option value="Açores">Açores</option>
          <option value="Madeira">Madeira</option>
        </select>
        <select className="select" value={mes} onChange={e => setMes(e.target.value)}>
          <option value="">Todos os meses</option>
          {meses.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Referência</th><th>Data Edição</th><th>Pág. Inicial</th><th>Estado</th>
              <th>Título / Localização</th><th>Início</th><th>Fim</th><th>Versão</th><th>Email</th><th>SMS</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && !items.length && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 11 }).map((__, j) => <td key={j}><div className="skeleton" style={{ height: 14 }} /></td>)}</tr>
            ))}
            {!loading && !items.length && (
              <tr><td colSpan={11} className="cell-empty">Nenhum comunicado encontrado para os filtros selecionados</td></tr>
            )}
            {items.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map(item => {
              const versoes: any[] = item.versoes ?? [];
              const ultima = versoes[versoes.length - 1];
              const emails = ultima?.emailEnvios ?? [];
              const sms = ultima?.smsEnvios ?? [];
              const d = dataUtc(item.atualizadoEm);
              const detalhe = [
                item.magnitude != null ? `Mag ${Number(item.magnitude).toFixed(1)} ML` : null,
                item.intmax ? `Int. ${item.intmax}` : null,
                item.local,
              ].filter(Boolean).join(' · ');
              return (
                <tr key={item.id}>
                  <td>
                    <span className="cell-primary">{item.referencia}</span>
                    <span className="cell-meta">Template {item.templateId} · {item.areaName}</span>
                  </td>
                  <td><span style={{ whiteSpace: 'nowrap' }}>{d.dia}</span><span className="cell-sub">{d.hora}</span></td>
                  <td><span className={item.primeiraPagina ? 'badge badge-success' : 'badge'}>{item.primeiraPagina ? 'Sim' : 'Não'}</span></td>
                  <td><span className={ESTADO_BADGE[item.estado] ?? 'badge'}>{ESTADO_LABELS[item.estado] ?? item.estado}</span></td>
                  <td>
                    <span className="cell-primary" title={item.titulo}>{item.titulo}</span>
                    <span className="cell-sub">{detalhe || '—'}</span>
                  </td>
                  <td><span style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>{item.websiteInicio ? dataUtc(item.websiteInicio).dia : '—'}</span></td>
                  <td><span style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>{item.websiteFim ? dataUtc(item.websiteFim).dia : '—'}</span></td>
                  <td>
                    {ultima ? (
                      <button type="button" className={versoes.length > 1 ? 'badge badge-purple' : 'badge'} style={{ cursor: 'pointer' }}
                        title={`Abrir PDF da versão ${String(ultima.numero).padStart(4, '0')}`}
                        onClick={() => abrirPdf(item.id, ultima.id).catch(() => undefined)}>
                        {String(ultima.numero).padStart(4, '0')}
                      </button>
                    ) : <span className="delivery-na">—</span>}
                  </td>
                  <td><Entrega envios={emails} /></td>
                  <td><Entrega envios={sms} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="row-action" title="Ver" onClick={() => router.push(`/comunicados/${item.id}`)}>
                        <Svg><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>
                      </button>
                      {item.estado !== 'CANCELADO' && item.estado !== 'ARQUIVADO' && (
                        <button className="row-action" title="Nova versão" onClick={() => router.push(`/comunicados/novo?versaoDe=${item.id}`)}>
                          <Svg><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></Svg>
                        </button>
                      )}
                      {(item.estado === 'APROVADO' || item.estado === 'PENDENTE' || item.estado === 'RASCUNHO') && (
                        <button className="btn btn-primary btn-sm" onClick={() => router.push(`/comunicados/${item.id}`)}>Enviar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length > POR_PAGINA && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {((pagina - 1) * POR_PAGINA) + 1}–{Math.min(pagina * POR_PAGINA, items.length)} de {items.length} registos
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPagina(1)} disabled={pagina === 1} style={{ padding: '4px 8px' }}>«</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPagina(p => p - 1)} disabled={pagina === 1} style={{ padding: '4px 10px' }}>‹</button>
              {Array.from({ length: Math.ceil(items.length / POR_PAGINA) }, (_, i) => i + 1)
                .filter(p => p === 1 || p === Math.ceil(items.length / POR_PAGINA) || Math.abs(p - pagina) <= 1)
                .reduce<(number | string)[]>((acc, p, i, arr) => {
                  if (i > 0 && (arr[i - 1] as number) + 1 < p) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => typeof p === 'string'
                  ? <span key={`e${i}`} style={{ padding: '4px 6px', fontSize: 12, color: 'var(--text-3)' }}>…</span>
                  : <button key={p} className={p === pagina ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                      onClick={() => setPagina(p as number)} style={{ padding: '4px 10px', minWidth: 34 }}>{p}</button>
                )}
              <button className="btn btn-secondary btn-sm" onClick={() => setPagina(p => p + 1)} disabled={pagina === Math.ceil(items.length / POR_PAGINA)} style={{ padding: '4px 10px' }}>›</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPagina(Math.ceil(items.length / POR_PAGINA))} disabled={pagina === Math.ceil(items.length / POR_PAGINA)} style={{ padding: '4px 8px' }}>»</button>
            </div>
          </div>
        )}
      </div>

      {showMapa && (
        <div className="modal-backdrop" onClick={() => setShowMapa(false)}>
          <div className="modal" style={{ width: 'min(860px,96vw)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-head" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              <strong style={{ fontSize: 15 }}>Mapa de Sismos</strong>
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>
                {items.filter((i: any) => i.lat != null).length} eventos com localização
              </span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowMapa(false)}>✕</button>
            </div>
            <div style={{ padding: '0 0 4px' }}>
              <MapaSismos
                pontos={items.filter((i: any) => i.lat != null && i.lon != null).map((i: any) => ({
                  id: i.id, referencia: i.referencia,
                  lat: Number(i.lat), lon: Number(i.lon),
                  magnitude: i.magnitude, local: i.local,
                  areaName: i.areaName, titulo: i.titulo,
                  estado: i.estado, eventDateTime: i.eventDateTime,
                }))}
                height={520}
              />
            </div>
            <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-3)' }}>Magnitude</span>
              {[['≥ 6', '#DC2626'], ['≥ 5', '#EA580C'], ['≥ 4', '#D97706'], ['≥ 3', '#22C55E'], ['< 3', '#3B82F6']].map(([label, color]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
