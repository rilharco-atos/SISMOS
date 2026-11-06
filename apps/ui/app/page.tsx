'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { comunicadosApi, abrirPdf, systemApi } from './lib/api';
import { MapaSismos } from './components/MapaSismos';

const COMPONENTES: Record<string, string> = { ftp: 'leitura de XML (FTP)', envio: 'envio de email/SMS', website: 'publicação no website', backup: 'backups' };

const ESTADO_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho', PENDENTE: 'Pendente', APROVADO: 'Ativo',
  ENVIADO: 'Enviado', CANCELADO: 'Cancelado', ARQUIVADO: 'Arquivado',
};
const ESTADO_BADGE: Record<string, string> = {
  RASCUNHO: 'badge', PENDENTE: 'badge badge-warning', APROVADO: 'badge badge-success',
  ENVIADO: 'badge badge-info', CANCELADO: 'badge badge-danger', ARQUIVADO: 'badge',
};
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
* @method       pct
* @description  Formats a ratio (0–1) as a percentage string with one decimal place, returning '—'
*               for null or undefined values.
* @param        v — ratio value (0 = 0%, 1 = 100%), or null/undefined
* @return       formatted percentage string (e.g. "98.7%") or '—'
*********************************************************************************************************************/
function pct(v: number | null | undefined) {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

/*********************************************************************************************************************
* @method       Entrega
* @description  Renders a compact delivery status badge for a set of email or SMS dispatch records.
*               Shows a failure count in red when any dispatch failed, a success count in green when
*               all succeeded, or a dash when there are no dispatch records.
* @param        envios — array of email or SMS delivery records with totalEnviado and totalFalha fields
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
* @description  Generates a UTF-8 BOM CSV file from the current bulletin list and triggers a browser
*               download. Columns: Referência, Template, Área, Estado, Título, Local, Magnitude,
*               Data evento (UTC), Versões. Fields are double-quote escaped.
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
* @method       DashboardPage
* @description  Operational dashboard for the IPMA Comunicados Sismológicos platform. Displays six
*               KPI tiles (bulletins this month, pending review, email and SMS delivery rates,
*               maximum magnitude, and automatic ingests in 24h), a table of the five most recent
*               bulletins, a system health alert when any component is degraded, and an optional full
*               seismic event map modal for all bulletins with location data.
* @return       JSX element — the dashboard page
* @uses         useRouter, comunicadosApi, abrirPdf, systemApi, MapaSismos, dataUtc, pct, Entrega, exportarCsv
*********************************************************************************************************************/
export default function DashboardPage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saude, setSaude] = useState<any>(null);
  const [showMapa, setShowMapa] = useState(false);
  const pontosComLocalizacao = items.filter((i: any) => i.lat != null && i.lon != null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiData, list, h] = await Promise.all([comunicadosApi.kpis(), comunicadosApi.list(''), systemApi.getHealth().catch(() => null)]);
      setKpis(kpiData); setItems(list); setSaude(h);
    } catch { router.push('/login'); }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const mesAtualCurto = MESES[new Date().getUTCMonth()];
  const mesAnteriorCurto = MESES[(new Date().getUTCMonth() + 11) % 12];
  const delta = kpis ? kpis.mesAtual - kpis.mesAnterior : 0;
  const v = (x: any) => (loading && !kpis ? '…' : x);
  const recentes = items.slice(0, 5);

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <span className="eyebrow">Sismologia Operacional</span>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Comunicados sismológicos — Centro de Operações IPMA</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMapa(true)} disabled={!pontosComLocalizacao.length}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Ver Mapa
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportarCsv(items)} disabled={!items.length}>Exportar CSV</button>
        </div>
      </div>

      {saude && saude.status !== 'ok' && (
        <div className="alert alert-warning">
          <strong>Atenção:</strong>{' '}
          {saude.status === 'down'
            ? 'base de dados indisponível.'
            : `problemas em ${Object.entries(saude.componentes ?? {}).filter(([, e]) => e === 'erro' || e === 'degradado').map(([k]) => COMPONENTES[k] ?? k).join(', ')}.`}
          {' '}Os detalhes estão em Backoffice › Configurações.
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Comunicados {mesAtualCurto}.</div>
          <div className="kpi-value">{v(kpis?.mesAtual ?? 0)}</div>
          <div className={`kpi-sub ${delta > 0 ? 'kpi-trend-up' : delta < 0 ? 'kpi-trend-dn' : ''}`}>
            {kpis ? `${delta > 0 ? '↑' : delta < 0 ? '↓' : '='} ${Math.abs(delta)} vs ${mesAnteriorCurto}` : '—'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pendentes Revisão</div>
          <div className="kpi-value" style={{ color: kpis?.pendentes ? 'var(--warning)' : undefined }}>{v(kpis?.pendentes ?? 0)}</div>
          <div className="kpi-sub">Aguardam aprovação</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Entrega Email</div>
          <div className="kpi-value">{v(pct(kpis?.taxaEmail))}</div>
          <div className="kpi-sub">{kpis?.totalEmail ? `${kpis.totalEmail} envios este mês` : 'Sem envios este mês'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Entrega SMS</div>
          <div className="kpi-value">{v(pct(kpis?.taxaSms))}</div>
          <div className="kpi-sub">via SMSExpress MEO</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Mag. Máx. {mesAtualCurto}.</div>
          <div className="kpi-value" style={{ color: kpis?.magMax ? 'var(--danger)' : undefined }}>
            {v(kpis?.magMax ? `${Number(kpis.magMax.magnitude).toFixed(1)} ML` : '—')}
          </div>
          <div className="kpi-sub">
            {kpis?.magMax ? `${kpis.magMax.areaName} — ${dataUtc(kpis.magMax.eventDateTime).dia.slice(0, 6)}` : 'Sem eventos este mês'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Automáticos (24h)</div>
          <div className="kpi-value">{v(kpis?.automaticos24h ?? 0)}</div>
          <div className="kpi-sub">Ingestão via FTP/XML</div>
        </div>
      </div>

      <div className="table-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 4px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Comunicados recentes</span>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push('/comunicados')} style={{ fontSize: 12 }}>
            Ver todos →
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Referência</th><th>Data Edição</th><th>Pág. Inicial</th><th>Estado</th>
              <th>Título / Localização</th><th>Início</th><th>Fim</th><th>Versão</th><th>Email</th><th>SMS</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && !recentes.length && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 11 }).map((__, j) => <td key={j}><div className="skeleton" style={{ height: 14 }} /></td>)}</tr>
            ))}
            {!loading && !recentes.length && (
              <tr><td colSpan={11} className="cell-empty">Sem comunicados recentes</td></tr>
            )}
            {recentes.map(item => {
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
      </div>

      {showMapa && (
        <div className="modal-backdrop" onClick={() => setShowMapa(false)}>
          <div className="modal" style={{ width: 'min(860px,96vw)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-head" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              <strong style={{ fontSize: 15 }}>Mapa de Sismos</strong>
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>
                {pontosComLocalizacao.length} eventos com localização
              </span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowMapa(false)}>✕</button>
            </div>
            <div style={{ padding: '0 0 4px' }}>
              <MapaSismos
                pontos={pontosComLocalizacao.map((i: any) => ({
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
