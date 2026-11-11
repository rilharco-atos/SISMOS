'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usersApi, listasApi, systemApi } from '../lib/api';

type Section = 'utilizadores' | 'email-listas' | 'sms-listas' | 'smtp' | 'sms-cfg' | 'website' | 'fluxo' | 'ingest' | 'saude' | 'dados';
const PAGE_SIZE = 50;
const LISTAS = ['LGA', 'LIA', 'LGM', 'LIM', 'LGC', 'LIC'];
const LISTA_LABELS: Record<string, string> = { LGA: 'Geral Açores', LIA: 'Institucional Açores', LGM: 'Geral Madeira', LIM: 'Institucional Madeira', LGC: 'Geral Continente', LIC: 'Institucional Continente' };

const SIDEBAR: { group: string; items: { key: Section; label: string; icon: string }[] }[] = [
  { group: 'Gestão', items: [
    { key: 'utilizadores', label: 'Utilizadores', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
    { key: 'email-listas', label: 'Listas de Email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { key: 'sms-listas', label: 'Listas de SMS', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  ]},
  { group: 'Configurações', items: [
    { key: 'smtp', label: 'Email (SMTP)', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { key: 'sms-cfg', label: 'Gateway SMS', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { key: 'website', label: 'Website IPMA', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9' },
    { key: 'fluxo', label: 'Fluxo automático', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
    { key: 'ingest', label: 'API de Ingestão', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
  ]},
  { group: 'Sistema', items: [
    { key: 'saude', label: 'Saúde do Sistema', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'dados', label: 'Dados', icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z' },
  ]},
];

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function Modal({ title, onClose, children, footer }: any) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>{title}</h2><button className="btn-icon" onClick={onClose}><Icon d="M6 18L18 6M6 6l12 12" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function Origem({ origem }: { origem?: string }) {
  if (!origem) return null;
  return <span className={origem === 'backoffice' ? 'badge badge-info' : 'badge'} title={origem === 'backoffice' ? 'Em uso: valores definidos aqui' : 'Em uso: variáveis de ambiente (.env)'}>
    Em uso: {origem === 'backoffice' ? 'definições' : '.env'}
  </span>;
}

/*********************************************************************************************************************
* @class        DefinicoesPage
* @description  Página de administração da plataforma IPMA Comunicados Sismológicos. Restrita a
*               utilizadores com o papel ADMIN. Apresenta uma sidebar de navegação com dez secções:
*               Utilizadores, Listas de Email, Listas de SMS, Email (SMTP), Gateway SMS, Website IPMA,
*               Fluxo automático, API de Ingestão, Saúde do Sistema e Dados.
* @lastupdate   10/11/2026
* @company      Atos
* @developer    Rui Ilharco
* @reviewed_by  Rui Ilharco
*********************************************************************************************************************/
export default function DefinicoesPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('utilizadores');
  const [users, setUsers] = useState<any[]>([]);
  const [destinatarios, setDestinatarios] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [health, setHealth] = useState<any>(null);
  const [modalUser, setModalUser] = useState<any>(null);
  const [modalDest, setModalDest] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterLista, setFilterLista] = useState('');
  const [teste, setTeste] = useState<Record<string, { aCorrer?: boolean; ok?: boolean; mensagem?: string }>>({});
  const [ingestKey, setIngestKey] = useState<string | null>(null);
  const [dadosTabelas, setDadosTabelas] = useState<{ key: string; label: string; total: number }[]>([]);
  const [dadosTabela, setDadosTabela] = useState('comunicados');
  const [dados, setDados] = useState<{ colunas: { key: string; label: string; tipo: string }[]; items: Record<string, any>[]; total: number; page: number; totalPages: number }>({ colunas: [], items: [], total: 0, page: 1, totalPages: 1 });
  const [dadosPage, setDadosPage] = useState(1);
  const [dadosQ, setDadosQ] = useState('');
  const [dadosQAplicada, setDadosQAplicada] = useState('');
  const [dadosLoading, setDadosLoading] = useState(false);

  const userFromStorage = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') ?? 'null') : null;
  const isAdmin = userFromStorage?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) { router.push('/'); return; }
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [u, d, c, h] = await Promise.all([usersApi.list(), listasApi.list(), systemApi.getConfig(), systemApi.getSaude()]);
      setUsers(u); setDestinatarios(d); setConfig(c ?? {}); setHealth(h);
    } catch { router.push('/login'); }
  }

  useEffect(() => {
    if (section !== 'dados' || !isAdmin) return;
    systemApi.getDadosTabelas().then(setDadosTabelas).catch((e: any) => setError(e.message));
  }, [section]);

  useEffect(() => {
    const t = setTimeout(() => { setDadosPage(1); setDadosQAplicada(dadosQ.trim()); }, 350);
    return () => clearTimeout(t);
  }, [dadosQ]);

  useEffect(() => {
    if (section !== 'dados' || !isAdmin) return;
    let cancelado = false;
    setDadosLoading(true);
    systemApi.getDadosTabela(dadosTabela, dadosPage, PAGE_SIZE, dadosQAplicada)
      .then(r => { if (!cancelado) setDados(r); })
      .catch((e: any) => { if (!cancelado) setError(e.message); })
      .finally(() => { if (!cancelado) setDadosLoading(false); });
    return () => { cancelado = true; };
  }, [section, dadosTabela, dadosPage, dadosQAplicada]);

  function escolherTabela(key: string) {
    if (key === dadosTabela) return;
    setDadosTabela(key); setDadosPage(1); setDadosQ(''); setDadosQAplicada('');
    setDados(d => ({ ...d, colunas: [], items: [], total: 0 }));
  }

  function celulaDados(tipo: string, v: any) {
    if (v === null || v === undefined || v === '') return '—';
    if (tipo === 'booleano') return v ? '✓' : '✗';
    if (tipo === 'data') return new Date(v).toLocaleString('pt-PT');
    if (tipo === 'numero') return Number(v).toLocaleString('pt-PT');
    if (tipo === 'badge') return <span className="badge badge-enviado">{String(v)}</span>;
    if (tipo === 'json') return JSON.stringify(v);
    return String(v);
  }

  async function saveUser() {
    setSaving(true); setError('');
    try {
      if (modalUser.id) { await usersApi.update(modalUser.id, { name: modalUser.name, role: modalUser.role, active: modalUser.active, ...(modalUser.password ? { password: modalUser.password } : {}) }); }
      else { await usersApi.create({ name: modalUser.name, email: modalUser.email, password: modalUser.password, role: modalUser.role }); }
      setModalUser(null); setMsg('Utilizador guardado'); loadAll();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function removeUser(id: string) {
    if (!confirm('Eliminar utilizador?')) return;
    await usersApi.remove(id); loadAll();
  }

  async function saveDest() {
    setSaving(true); setError('');
    try {
      const data = { nome: modalDest.nome, organizacao: modalDest.organizacao, email: modalDest.emailRaw ?? '', telefone: modalDest.telefoneRaw ?? '', listas: modalDest.listas ?? [], interno: !!modalDest.interno };
      if (modalDest.id) await listasApi.update(modalDest.id, data);
      else await listasApi.create(data);
      setModalDest(null); setMsg('Destinatário guardado'); loadAll();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function removeDest(id: string) {
    if (!confirm('Eliminar destinatário?')) return;
    await listasApi.remove(id); loadAll();
  }

  async function saveConfig() {
    setSaving(true); setError('');
    const CAMPOS = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'smtpFrom', 'emailRemetente', 'smsSender', 'smsMode', 'envioAutomatico'];
    const payload = Object.fromEntries(CAMPOS.filter(k => config[k] !== undefined && config[k] !== null).map(k => [k, config[k]]));
    try { setConfig(await systemApi.updateConfig(payload)); setMsg('Configuração guardada'); }
    catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function testar(servico: 'smtp') {
    setTeste(t => ({ ...t, [servico]: { aCorrer: true } }));
    try {
      const r = await systemApi.testarSmtp();
      setTeste(t => ({ ...t, [servico]: { ok: r.ok, mensagem: r.mensagem } }));
    } catch (e: any) {
      setTeste(t => ({ ...t, [servico]: { ok: false, mensagem: e.message } }));
    }
  }

  async function gerarChaveIngest() {
    setTeste(t => ({ ...t, ingestKey: { aCorrer: true } }));
    setIngestKey(null);
    try {
      const r = await systemApi.gerarIngestApiKey();
      setIngestKey(r.apiKey);
      setConfig((c: any) => ({ ...c, temIngestApiKey: true }));
      setTeste(t => ({ ...t, ingestKey: { ok: true } }));
    } catch (e: any) {
      setTeste(t => ({ ...t, ingestKey: { ok: false, mensagem: e.message } }));
    }
  }

  function ResultadoTeste({ servico }: { servico: string }) {
    const r = teste[servico];
    if (!r || r.aCorrer) return null;
    return <div className={`alert ${r.ok ? 'alert-success' : 'alert-error'}`} style={{ margin: '12px 0 0' }}>{r.mensagem}</div>;
  }

  const filteredDests = filterLista ? destinatarios.filter(d => d.lista === filterLista) : destinatarios;

  function SidebarItem({ k, label, icon, collapsed }: { k: Section; label: string; icon: string; collapsed?: boolean }) {
    const active = section === k;
    return (
      <button
        onClick={() => setSection(k)}
        title={collapsed ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 10, width: '100%',
          padding: collapsed ? '10px 0' : '8px 16px',
          border: 'none', borderRadius: 0, cursor: 'pointer',
          fontSize: 13, textAlign: 'left',
          background: active ? 'var(--accent-muted, rgba(34,197,94,0.08))' : 'transparent',
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: active ? 600 : 400,
          borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        }}
      >
        <Icon d={icon} size={15} />
        {!collapsed && label}
      </button>
    );
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Definições</span>
        {health && <span className={`badge ${health.status === 'ok' ? 'badge-success' : health.status === 'down' ? 'badge-danger' : 'badge-warning'}`}>
          Sistema: {health.status === 'ok' ? 'operacional' : health.status === 'down' ? 'indisponível' : 'degradado'}
        </span>}
      </div>

      {msg && <div className="alert alert-success" style={{ margin: '0 24px', borderRadius: 0 }} onClick={() => setMsg('')}>{msg}</div>}
      {error && <div className="alert alert-error" style={{ margin: '0 24px', borderRadius: 0 }} onClick={() => setError('')}>{error}</div>}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 56px)' }}>

        {/* Sidebar — estreita em Dados mas permanece navegável via ícones */}
        <nav style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: section === 'dados' ? '8px 0' : '12px 0', background: 'var(--bg-secondary)', minWidth: section === 'dados' ? 48 : 220, maxWidth: section === 'dados' ? 48 : 220, overflow: 'hidden', transition: 'min-width 0.2s, max-width 0.2s' }}>
          {SIDEBAR.map(({ group, items }) => (
            <div key={group}>
              {section !== 'dados' && <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{group}</div>}
              {items.map(({ key, label, icon }) => <SidebarItem key={key} k={key} label={label} icon={icon} collapsed={section === 'dados'} />)}
            </div>
          ))}
        </nav>

        {/* Conteúdo */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* UTILIZADORES */}
          {section === 'utilizadores' && (
            <div className="table-wrap">
              <div className="table-header">
                <span className="table-title">Utilizadores</span>
                <button className="btn btn-primary btn-sm" onClick={() => setModalUser({ name: '', email: '', password: '', role: 'ANALISTA', active: true })}>
                  <Icon d="M12 4v16m8-8H4" size={14} /> Novo
                </button>
              </div>
              <table>
                <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Ativo</th><th>Ações</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.email}</td>
                      <td><span className={`badge ${u.role === 'ADMIN' ? 'badge-aprovado' : 'badge-enviado'}`}>{u.role}</span></td>
                      <td>{u.active ? '✓' : '✗'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" onClick={() => setModalUser({ ...u, password: '' })}><Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></button>
                          <button className="btn-icon" style={{ color: 'var(--state-cancelado)' }} onClick={() => removeUser(u.id)}><Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LISTAS EMAIL / SMS */}
          {(section === 'email-listas' || section === 'sms-listas') && (
            <div className="table-wrap">
              <div className="table-header">
                <span className="table-title">{section === 'email-listas' ? 'Listas de Email' : 'Listas de SMS'}</span>
                <select className="form-control" style={{ width: 'auto' }} value={filterLista} onChange={e => setFilterLista(e.target.value)}>
                  <option value="">Todas as listas</option>
                  {LISTAS.map(l => <option key={l} value={l}>{l} — {LISTA_LABELS[l]}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={() => setModalDest({ nome: '', organizacao: '', emailRaw: '', telefoneRaw: '', listas: [] })}>
                  <Icon d="M12 4v16m8-8H4" size={14} /> Novo
                </button>
              </div>
              <table>
                <thead><tr><th>Nome</th><th>Organização</th><th>{section === 'email-listas' ? 'Email (mascarado)' : 'Telefone (mascarado)'}</th><th>Listas</th><th>Ações</th></tr></thead>
                <tbody>
                  {filteredDests.map(d => (
                    <tr key={d.destinatarioId ?? d.id}>
                      <td>{d.destinatario?.nome ?? d.nome}{d.destinatario?.interno && <span className="badge badge-info" style={{ marginLeft: 8 }}>Interno</span>}</td>
                      <td>{d.destinatario?.organizacao ?? d.organizacao ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {section === 'email-listas' ? (d.destinatario?.email ?? d.email) : (d.destinatario?.telefone ?? d.telefone ?? '—')}
                      </td>
                      <td><span className="badge badge-enviado">{d.lista}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" onClick={() => setModalDest({ ...(d.destinatario ?? d), id: d.destinatarioId ?? d.id, listas: [d.lista], emailRaw: '', telefoneRaw: '' })}><Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></button>
                          <button className="btn-icon" style={{ color: 'var(--state-cancelado)' }} onClick={() => removeDest(d.destinatarioId ?? d.id)}><Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredDests.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Nenhum destinatário</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* EMAIL (SMTP) */}
          {section === 'smtp' && (
            <div style={{ maxWidth: 680 }}>
              <div className="card">
                <div className="card-title"><Icon d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /> SMTP / Email <span style={{ marginLeft: 'auto' }}><Origem origem={config.origemSmtp} /></span></div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Host SMTP</label><input className="form-control" value={config.smtpHost ?? ''} onChange={e => setConfig((c: any) => ({ ...c, smtpHost: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Porta</label><input type="number" className="form-control" value={config.smtpPort ?? 587} onChange={e => setConfig((c: any) => ({ ...c, smtpPort: parseInt(e.target.value) }))} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Utilizador</label><input className="form-control" value={config.smtpUser ?? ''} onChange={e => setConfig((c: any) => ({ ...c, smtpUser: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Password</label><input type="password" className="form-control" autoComplete="new-password" placeholder={config.temSmtpPassword ? '•••••••• (definida — deixe vazio para manter)' : 'Não definida'} value={config.smtpPassword ?? ''} onChange={e => setConfig((c: any) => ({ ...c, smtpPassword: e.target.value }))} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Email remetente</label><input className="form-control" value={config.smtpFrom ?? ''} onChange={e => setConfig((c: any) => ({ ...c, smtpFrom: e.target.value }))} placeholder="sismos@ipma.pt" /></div>
                  <div className="form-group"><label className="form-label">Nome do remetente</label><input className="form-control" value={config.emailRemetente ?? ''} onChange={e => setConfig((c: any) => ({ ...c, emailRemetente: e.target.value }))} placeholder="IPMA — Serviço de Sismologia" /></div>
                </div>
                <div className="form-hint">Porta 465 usa TLS direto; 587 usa STARTTLS. Com o host vazio, o sistema usa as variáveis SMTP_* do ambiente. Guarde antes de testar.</div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" disabled={teste.smtp?.aCorrer} onClick={() => testar('smtp')}>{teste.smtp?.aCorrer ? 'A testar…' : 'Testar Ligação'}</button>
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveConfig}>{saving ? 'A guardar…' : 'Guardar'}</button>
                </div>
                <ResultadoTeste servico="smtp" />
              </div>
            </div>
          )}

          {/* GATEWAY SMS */}
          {section === 'sms-cfg' && (
            <div style={{ maxWidth: 680 }}>
              <div className="card">
                <div className="card-title"><Icon d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /> Gateway SMS (SMSExpress MEO)</div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Remetente SMS</label><input className="form-control" value={config.smsSender ?? ''} onChange={e => setConfig((c: any) => ({ ...c, smsSender: e.target.value }))} /></div>
                  <div className="form-group">
                    <label className="form-label">Modo</label>
                    <select className="form-control" value={config.modoImpostoPeloAmbiente ? 'test' : (config.smsMode ?? 'test')} disabled={config.modoImpostoPeloAmbiente} onChange={e => setConfig((c: any) => ({ ...c, smsMode: e.target.value }))}>
                      <option value="test">Teste (só contactos internos)</option>
                      <option value="production">Produção (envio real)</option>
                    </select>
                    <div className="form-hint">
                      {config.modoImpostoPeloAmbiente
                        ? 'Ambiente de testes: o modo teste é obrigatório e não pode ser alterado.'
                        : 'Em modo teste, emails e SMS vão apenas para os destinatários marcados como "Contacto interno IPMA".'}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveConfig}>{saving ? 'A guardar…' : 'Guardar'}</button>
                </div>
              </div>
            </div>
          )}

          {/* WEBSITE IPMA */}
          {section === 'website' && (
            <div style={{ maxWidth: 680 }}>
              <div className="card">
                <div className="card-title">
                  <Icon d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /> Website IPMA
                  <span style={{ marginLeft: 'auto' }} className={`badge ${config.website?.ativa ? 'badge-success' : ''}`}>
                    {config.website?.ativa ? `Ativa (${config.website.tipo})` : 'Inativa'}
                  </span>
                </div>
                <p className="form-hint" style={{ fontSize: 12 }}>
                  {config.website?.ativa
                    ? 'Os comunicados ativos são publicados ao enviar e retirados ao cancelar, arquivar ou desativar.'
                    : config.ambiente === 'test'
                      ? 'Desativada no ambiente de testes.'
                      : 'Integração por configurar no servidor (WEBSITE_PUBLISHER = http ou ficheiro), a definir com a equipa do website.'}
                </p>
              </div>
            </div>
          )}

          {/* FLUXO AUTOMÁTICO */}
          {section === 'fluxo' && (
            <div style={{ maxWidth: 680 }}>
              <div className="card">
                <div className="card-title"><Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /> Fluxo automático</div>
                <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
                  <input type="checkbox" style={{ marginTop: 3, accentColor: 'var(--accent)' }} checked={!!config.envioAutomatico} onChange={e => setConfig((c: any) => ({ ...c, envioAutomatico: e.target.checked }))} />
                  <span>
                    <span className="field-label">Aprovar e enviar automaticamente</span>
                    <span className="form-hint" style={{ display: 'block', marginTop: 2 }}>
                      Quando ativo, cada XML recebido do Centro de Operações é aprovado e enviado por email e SMS para as listas indicadas em emailKey/smsKey.
                      Se o texto do template ficar com marcadores por preencher ou o XML não indicar listas, o comunicado fica em rascunho para o analista.
                    </span>
                  </span>
                </label>
                {config.envioAutomatico && config.smsMode !== 'production' && (
                  <div className="alert alert-info" style={{ margin: '12px 0 0' }}>Com o modo de envio em Teste, os envios automáticos vão apenas para os endereços internos.</div>
                )}
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveConfig}>{saving ? 'A guardar…' : 'Guardar'}</button>
                </div>
              </div>
            </div>
          )}

          {/* API DE INGESTÃO */}
          {section === 'ingest' && (
            <div style={{ maxWidth: 680 }}>
              <div className="card">
                <div className="card-title"><Icon d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /> API de Ingestão (PONTE)</div>
                <p className="form-hint" style={{ fontSize: 12 }}>
                  Chave de API para o PONTE enviar XML sísmicos via <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>POST /api/ingest/xml</span>.
                  Inclua o header <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>X-Api-Key: &lt;chave&gt;</span> em cada pedido.
                  A variável de ambiente <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>INGEST_API_KEY</span> tem precedência quando definida.
                </p>
                <div className="row" style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <span className={`badge ${config.temIngestApiKey ? 'badge-success' : ''}`}>
                    {config.temIngestApiKey ? 'Chave definida' : 'Sem chave'}
                  </span>
                  <button className="btn btn-secondary btn-sm" disabled={!!teste.ingestKey?.aCorrer} onClick={gerarChaveIngest}>
                    {teste.ingestKey?.aCorrer ? 'A gerar…' : 'Gerar nova chave'}
                  </button>
                </div>
                {ingestKey && (
                  <div className="alert alert-info" style={{ margin: '12px 0 0' }}>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Guarde esta chave agora — não será mostrada novamente.</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all', marginBottom: 8 }}>{ingestKey}</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(ingestKey)}>Copiar</button>
                  </div>
                )}
                {teste.ingestKey && !teste.ingestKey.aCorrer && !ingestKey && (
                  <div className={`alert ${teste.ingestKey.ok ? 'alert-success' : 'alert-error'}`} style={{ margin: '12px 0 0' }}>{teste.ingestKey.mensagem}</div>
                )}
              </div>
            </div>
          )}

          {/* SAÚDE DO SISTEMA */}
          {section === 'saude' && (
            <div style={{ maxWidth: 680 }}>
              {health?.componentes ? (
                <div className="card">
                  <div className="card-title">Saúde do Sistema
                    <span style={{ marginLeft: 'auto' }} className={`badge ${health.status === 'ok' ? 'badge-success' : health.status === 'down' ? 'badge-danger' : 'badge-warning'}`}>
                      {health.status === 'ok' ? 'Operacional' : health.status === 'down' ? 'Indisponível' : 'Degradado'}
                    </span>
                  </div>
                  {([['db', 'Base de dados PostgreSQL'], ['envio', 'Envio de email e SMS'], ['website', 'Publicação no website IPMA'], ['backup', 'Backups']] as [string, string][]).map(([k, label]) => {
                    const c = k === 'db' ? { estado: health.db === 'ok' ? 'ok' : 'erro' } : health.componentes[k];
                    const cor = c?.estado === 'ok' ? 'dot-success' : c?.estado === 'erro' ? 'dot-danger' : c?.estado === 'degradado' ? 'dot-warning' : 'dot-muted';
                    const quando = c?.ultimoSucesso ? new Date(c.ultimoSucesso).toLocaleString('pt-PT') : null;
                    return (
                      <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="row" style={{ gap: 8 }}><span className={`status-dot ${cor}`} /><span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span></span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right' }}>
                          {c?.mensagem ?? ({ ok: 'OK', sem_dados: 'Sem dados', desativado: 'Desativado' } as Record<string, string>)[c?.estado] ?? c?.estado}
                          {quando && c?.estado !== 'erro' && <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11 }}>último sucesso {quando}</span>}
                        </span>
                      </div>
                    );
                  })}
                  <div className="form-hint" style={{ marginTop: 10 }}>
                    Ambiente: <strong>{health.ambiente === 'test' ? 'testes' : health.ambiente === 'production' ? 'produção' : 'desenvolvimento'}</strong> ·
                    Métricas Prometheus em <span className="mono">/api/metrics</span>
                  </div>
                </div>
              ) : (
                <div className="card"><div className="form-hint">A carregar estado do sistema…</div></div>
              )}
            </div>
          )}

          {/* DADOS */}
          {section === 'dados' && (
            <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
              <div className="card" style={{ padding: 8, margin: 0 }}>
                <div className="form-label" style={{ padding: '6px 8px' }}>Tabelas</div>
                {dadosTabelas.map(t => (
                  <button key={t.key} onClick={() => escolherTabela(t.key)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8, padding: '7px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, textAlign: 'left', background: t.key === dadosTabela ? 'var(--accent-muted, rgba(0,0,0,0.06))' : 'transparent', color: 'inherit', fontWeight: t.key === dadosTabela ? 600 : 400 }}>
                    <span>{t.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{t.total.toLocaleString('pt-PT')}</span>
                  </button>
                ))}
              </div>

              <div className="table-wrap" style={{ minWidth: 0 }}>
                <div className="table-header">
                  <span className="table-title">{dadosTabelas.find(t => t.key === dadosTabela)?.label ?? 'Dados'}</span>
                  <input className="form-control" style={{ width: 240 }} placeholder="Pesquisar…" value={dadosQ} onChange={e => setDadosQ(e.target.value)} />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr>{dados.colunas.filter(col => col.tipo !== 'oculto').map(col => <th key={col.key} style={{ whiteSpace: 'nowrap' }}>{col.label}</th>)}</tr></thead>
                    <tbody>
                      {dados.items.map((row, i) => (
                        <tr key={i}
                          style={{ opacity: dadosLoading ? 0.5 : 1, ...(dadosTabela === 'comunicados' && row.id ? { cursor: 'pointer' } : {}) }}
                          onClick={dadosTabela === 'comunicados' && row.id ? () => router.push(`/comunicados/${row.id}`) : undefined}>
                          {dados.colunas.filter(col => col.tipo !== 'oculto').map(col => (
                            <td key={col.key} title={typeof row[col.key] === 'string' ? row[col.key] : undefined}
                              style={{
                                ...(col.tipo === 'mono' || col.tipo === 'data' || col.tipo === 'json' ? { fontFamily: 'var(--font-mono)', fontSize: 11 } : {}),
                                ...(col.tipo === 'data' || col.tipo === 'numero' ? { whiteSpace: 'nowrap' } : { maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                                ...(col.tipo === 'numero' ? { textAlign: 'right' } : {}),
                              }}>
                              {celulaDados(col.tipo, row[col.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {dados.items.length === 0 && <tr><td colSpan={Math.max(dados.colunas.filter(c => c.tipo !== 'oculto').length, 1)} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>{dadosLoading ? 'A carregar…' : 'Sem registos'}</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-header" style={{ borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {dados.total === 0 ? '0 registos' : `${((dados.page - 1) * PAGE_SIZE + 1).toLocaleString('pt-PT')}–${Math.min(dados.page * PAGE_SIZE, dados.total).toLocaleString('pt-PT')} de ${dados.total.toLocaleString('pt-PT')}`}
                  </span>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {dados.page} de {dados.totalPages}</span>
                    <button className="btn btn-secondary btn-sm" disabled={dadosLoading || dados.page <= 1} onClick={() => setDadosPage(1)}>«</button>
                    <button className="btn btn-secondary btn-sm" disabled={dadosLoading || dados.page <= 1} onClick={() => setDadosPage(p => Math.max(p - 1, 1))}>Anterior</button>
                    <button className="btn btn-secondary btn-sm" disabled={dadosLoading || dados.page >= dados.totalPages} onClick={() => setDadosPage(p => p + 1)}>Seguinte</button>
                    <button className="btn btn-secondary btn-sm" disabled={dadosLoading || dados.page >= dados.totalPages} onClick={() => setDadosPage(dados.totalPages)}>»</button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Modal Utilizador */}
      {modalUser && (
        <Modal title={modalUser.id ? 'Editar Utilizador' : 'Novo Utilizador'} onClose={() => setModalUser(null)}
          footer={<><button className="btn btn-secondary" onClick={() => setModalUser(null)}>Cancelar</button><button className="btn btn-primary" disabled={saving} onClick={saveUser}>{saving ? '…' : 'Guardar'}</button></>}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group"><label className="form-label">Nome</label><input className="form-control" value={modalUser.name} onChange={e => setModalUser((u: any) => ({ ...u, name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={modalUser.email} onChange={e => setModalUser((u: any) => ({ ...u, email: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Password {modalUser.id ? '(deixar em branco para manter)' : ''}</label><input type="password" className="form-control" value={modalUser.password} onChange={e => setModalUser((u: any) => ({ ...u, password: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Perfil</label><select className="form-control" value={modalUser.role} onChange={e => setModalUser((u: any) => ({ ...u, role: e.target.value }))}><option value="ANALISTA">Analista</option><option value="ADMIN">Administrador</option></select></div>
          {modalUser.id && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={modalUser.active} onChange={e => setModalUser((u: any) => ({ ...u, active: e.target.checked }))} />Ativo</label>}
        </Modal>
      )}

      {/* Modal Destinatário */}
      {modalDest && (
        <Modal title={modalDest.id ? 'Editar Destinatário' : 'Novo Destinatário'} onClose={() => setModalDest(null)}
          footer={<><button className="btn btn-secondary" onClick={() => setModalDest(null)}>Cancelar</button><button className="btn btn-primary" disabled={saving} onClick={saveDest}>{saving ? '…' : 'Guardar'}</button></>}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group"><label className="form-label">Nome</label><input className="form-control" value={modalDest.nome} onChange={e => setModalDest((d: any) => ({ ...d, nome: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Organização</label><input className="form-control" value={modalDest.organizacao ?? ''} onChange={e => setModalDest((d: any) => ({ ...d, organizacao: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Email (RGPD)</label><input type="email" className="form-control" value={modalDest.emailRaw ?? ''} onChange={e => setModalDest((d: any) => ({ ...d, emailRaw: e.target.value }))} placeholder="Introduza o email completo — será mascarado na listagem" /></div>
          <div className="form-group"><label className="form-label">Telefone (RGPD)</label><input className="form-control" value={modalDest.telefoneRaw ?? ''} onChange={e => setModalDest((d: any) => ({ ...d, telefoneRaw: e.target.value }))} placeholder="Introduza o telefone completo — será mascarado na listagem" /></div>
          <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start', marginBottom: 12 }}>
            <input type="checkbox" style={{ marginTop: 3, accentColor: 'var(--accent)' }} checked={!!modalDest.interno} onChange={e => setModalDest((d: any) => ({ ...d, interno: e.target.checked }))} />
            <span>
              <span className="form-label">Contacto interno IPMA</span>
              <span className="form-hint" style={{ display: 'block' }}>Em modo de teste (e no ambiente de testes) só os contactos internos recebem emails e SMS.</span>
            </span>
          </label>
          <div className="form-group">
            <label className="form-label">Listas</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {LISTAS.map(l => (
                <label key={l} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={(modalDest.listas ?? []).includes(l)}
                    onChange={() => setModalDest((d: any) => ({ ...d, listas: d.listas?.includes(l) ? d.listas.filter((x: string) => x !== l) : [...(d.listas ?? []), l] }))} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{l}</span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
