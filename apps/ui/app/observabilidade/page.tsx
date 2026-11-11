'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { systemApi } from '../lib/api';

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

type EstadoNivel = 'ok' | 'degradado' | 'erro' | 'desativado' | 'desconhecido';

function nivelCor(n: EstadoNivel): string {
  if (n === 'ok')         return 'var(--accent)';
  if (n === 'degradado')  return '#f59e0b';
  if (n === 'erro')       return '#ef4444';
  return 'var(--text-muted)';
}

function nivelLabel(n: EstadoNivel): string {
  if (n === 'ok')         return 'OK';
  if (n === 'degradado')  return 'Degradado';
  if (n === 'erro')       return 'Erro';
  if (n === 'desativado') return 'Desactivado';
  return '—';
}

function ComponenteCard({ nome, estado, detalhe }: { nome: string; estado: EstadoNivel; detalhe?: string }) {
  const cor = nivelCor(estado);
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{nome}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          color: cor, background: cor + '1a', borderRadius: 5, padding: '2px 8px',
        }}>{nivelLabel(estado)}</span>
      </div>
      {detalhe && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detalhe}</span>}
      <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: 'var(--bg-tertiary)' }}>
        <div style={{
          height: '100%', borderRadius: 2, background: cor,
          width: estado === 'ok' ? '100%' : estado === 'degradado' ? '50%' : estado === 'erro' ? '15%' : '0%',
          transition: 'width 0.4s',
        }} />
      </div>
    </div>
  );
}

function KpiCard({ label, valor, sub }: { label: string; valor: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}


/*********************************************************************************************************************
* @class        ObservabilidadePage
* @description  Admin-only page that shows the operational health of the IPMA Comunicados Sismológicos
*               platform. Displays component status (DB, SMTP, website, backup), live KPIs,
*               manual diagnostic actions (test SMTP, refresh), and links to the external
*               monitoring stack (Grafana, Prometheus, Alertmanager). Auto-refreshes every 30 s.
* @lastupdate   09/11/2026
* @company      Atos
* @developer    Rui Ilharco
*********************************************************************************************************************/
export default function ObservabilidadePage() {
  const router = useRouter();
  const [health, setHealth]         = useState<any>(null);
  const [kpis, setKpis]             = useState<any>(null);
  const [actualizadoEm, setAct]     = useState<Date | null>(null);
  const [loading, setLoading]       = useState(true);

  const userFromStorage = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') ?? 'null') : null;
  const isAdmin = userFromStorage?.role === 'ADMIN';

  const carregar = useCallback(async () => {
    try {
      const h = await systemApi.getHealth();
      setHealth(h);
      try {
        const kp = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/comunicados/kpis`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }).then(r => r.json());
        setKpis(kp);
      } catch {}
      setAct(new Date());
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isAdmin) { router.replace('/'); return; }
    carregar();
    const id = setInterval(carregar, 30000);
    return () => clearInterval(id);
  }, []);

  const comp = health?.componentes ?? {};
  const estadoGeral: EstadoNivel =
    health?.status === 'ok' ? 'ok' :
    health?.status === 'degraded' ? 'degradado' :
    health?.status ? 'erro' : 'desconhecido';
  const corGeral = nivelCor(estadoGeral);

  if (loading) {
    return (
      <div style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
        <span style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        A carregar…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Observabilidade</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Estado operacional da plataforma · actualiza a cada 30 s
            {actualizadoEm && ` · última leitura ${actualizadoEm.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={carregar} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            Actualizar
          </button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: corGeral + '1a', border: `1px solid ${corGeral}40`,
            borderRadius: 10, padding: '10px 18px',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: corGeral, display: 'inline-block', boxShadow: `0 0 0 3px ${corGeral}30` }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: corGeral }}>{nivelLabel(estadoGeral)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Estado geral</span>
          </div>
        </div>
      </div>

      {/* Componentes */}
      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 12px' }}>Componentes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <ComponenteCard
            nome="Base de Dados"
            estado={health?.db === 'ok' ? 'ok' : 'erro'}
            detalhe={health?.db === 'ok' ? 'PostgreSQL ligado' : 'Sem ligação'}
          />
          <ComponenteCard
            nome="Envio"
            estado={comp.envio === 'ok' ? 'ok' : comp.envio === 'degradado' ? 'degradado' : 'erro'}
            detalhe={comp.envio === 'ok' ? 'SMTP/SMS operacionais' : 'Verificar configurações'}
          />
          <ComponenteCard
            nome="Website IPMA"
            estado={comp.website === 'ok' ? 'ok' : comp.website === 'desativado' ? 'desativado' : 'degradado'}
            detalhe={comp.website === 'desativado' ? 'Publicação desactivada' : comp.website === 'ok' ? 'API acessível' : 'Sem ligação'}
          />
          <ComponenteCard
            nome="Backup"
            estado={comp.backup === 'ok' ? 'ok' : comp.backup === 'degradado' ? 'degradado' : comp.backup === 'desativado' ? 'desativado' : 'erro'}
            detalhe={comp.backup === 'degradado' ? 'Container parado' : comp.backup === 'ok' ? 'A correr' : 'Verificar container'}
          />
        </div>
      </section>

      {/* KPIs */}
      {kpis && (
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 12px' }}>Métricas operacionais</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {kpis.total      != null && <KpiCard label="Total comunicados" valor={kpis.total} />}
            {kpis.aprovados  != null && <KpiCard label="Aprovados"         valor={kpis.aprovados} />}
            {kpis.rascunhos  != null && <KpiCard label="Rascunhos"         valor={kpis.rascunhos} />}
            {kpis.enviados   != null && <KpiCard label="Enviados"          valor={kpis.enviados} />}
            {kpis.ultimoEnvioHa != null && (
              <KpiCard
                label="Último envio"
                valor={kpis.ultimoEnvioHa < 1 ? '< 1 h' : `${kpis.ultimoEnvioHa} h`}
                sub="horas atrás"
              />
            )}
          </div>
        </section>
      )}

      {/* Monitorização externa */}
      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 12px' }}>Monitorização externa</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'Grafana', sub: 'Dashboards operacionais', href: 'http://localhost:3010/monitoring/grafana', icon: 'M18 20V10M12 20V4M6 20v-6' },
            { label: 'Prometheus', sub: 'Métricas brutas', href: 'http://localhost:9095', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
            { label: 'Alertmanager', sub: 'Alertas activos', href: 'http://localhost:9096', icon: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0' },
          ].map(({ label, sub, href, icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 18px', textDecoration: 'none',
                minWidth: 170, transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                <Icon d={icon} size={15} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
                <Icon d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" size={12} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{href}</span>
            </a>
          ))}
        </div>
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
