'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { comunicadosApi, abrirPdf, systemApi } from './lib/api';

const COMPONENTES: Record<string, string> = { ftp: 'leitura de XML (FTP)', envio: 'envio de email/SMS', website: 'publicação no website', backup: 'backups' };

const ESTADO_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho', PENDENTE: 'Pendente', APROVADO: 'Aprovado',
  ENVIADO: 'Enviado', CANCELADO: 'Cancelado', ARQUIVADO: 'Arquivado',
};
const ESTADO_BADGE: Record<string, string> = {
  RASCUNHO: 'badge', PENDENTE: 'badge badge-warning', APROVADO: 'badge badge-success',
  ENVIADO: 'badge badge-info', CANCELADO: 'badge badge-danger', ARQUIVADO: 'badge',
};
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function Svg({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24">{children}</svg>;
}

function ultimosMeses(n: number) {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push({ value: `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MESES_LONGOS[m.getUTCMonth()]} ${m.getUTCFullYear()}` });
  }
  return out;
}

function dataUtc(d?: string) {
  if (!d) return { dia: '—', hora: '' };
  const x = new Date(d);
  return {
    dia: `${String(x.getUTCDate()).padStart(2, '0')} ${MESES[x.getUTCMonth()]} ${x.getUTCFullYear()}`,
    hora: `${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')} UTC`,
  };
}

function pct(v: number | null | undefined) {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function Entrega({ envios }: { envios: any[] }) {
  if (!envios.length) return <span className="delivery-na">—</span>;
  const enviados = envios.reduce((s, e) => s + (e.totalEnviado ?? 0), 0);
  const falhas = envios.reduce((s, e) => s + (e.totalFalha ?? 0), 0);
  if (falhas > 0) return <span className="delivery-fail" title={`${enviados} enviados, ${falhas} falhas`}>✗ {falhas}</span>;
  return <span className="delivery-ok">✓ {enviados}</span>;
}

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

export default function DashboardPage() {
  const router = useRouter();
  const meses = useMemo(() => ultimosMeses(12), []);
  const [kpis, setKpis] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [area, setArea] = useState('');
  const [mes, setMes] = useState(meses[0].value);
  const [saude, setSaude] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (estado) params.set('estado', estado);
      if (area) params.set('areaName', area);
      if (mes) params.set('mes', mes);
      const [kpiData, list, h] = await Promise.all([comunicadosApi.kpis(), comunicadosApi.list(params.toString()), systemApi.getHealth().catch(() => null)]);
      setKpis(kpiData); setItems(list); setSaude(h);
    } catch { router.push('/login'); }
    setLoading(false);
  }, [search, estado, area, mes, router]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const mesAtualCurto = MESES[new Date().getUTCMonth()];
  const mesAnteriorCurto = MESES[(new Date().getUTCMonth() + 11) % 12];
  const delta = kpis ? kpis.mesAtual - kpis.mesAnterior : 0;
  const v = (x: any) => (loading && !kpis ? '…' : x);

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <span className="eyebrow">Sismologia Operacional</span>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Comunicados sismológicos — Centro de Operações IPMA</p>
        </div>
        <div className="page-actions">
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

      <div className="filter-bar">
        <div className="search">
          <Svg><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>
          <input className="input" type="search" placeholder="Pesquisar referência, título..." value={search} onChange={e => setSearch(e.target.value)} />
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
          {meses.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          <option value="">Todos os meses</option>
        </select>
      </div>

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Referência</th><th>Data Edição</th><th>Pág. Inicial</th><th>Estado</th>
              <th>Título / Localização</th><th>Versão</th><th>Email</th><th>SMS</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && !items.length && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 9 }).map((__, j) => <td key={j}><div className="skeleton" style={{ height: 14 }} /></td>)}</tr>
            ))}
            {!loading && !items.length && (
              <tr><td colSpan={9} className="cell-empty">Nenhum comunicado encontrado para os filtros selecionados</td></tr>
            )}
            {items.map(item => {
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
                  <td>
                    {ultima ? (
                      <button type="button" className={versoes.length > 1 ? 'badge badge-purple' : 'badge'} style={{ cursor: 'pointer' }}
                        title={`Abrir PDF da versão ${String(ultima.numero).padStart(3, '0')}`}
                        onClick={() => abrirPdf(item.id, ultima.id).catch(() => undefined)}>
                        v{String(ultima.numero).padStart(3, '0')}
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
    </>
  );
}
