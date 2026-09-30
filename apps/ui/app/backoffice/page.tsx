'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usersApi, listasApi, systemApi } from '../lib/api';

type Tab = 'utilizadores' | 'mailing' | 'sms' | 'config' | 'auditoria';
const LISTAS = ['LGA', 'LIA', 'LGM', 'LIM', 'LGC', 'LIC'];
const LISTA_LABELS: Record<string, string> = { LGA: 'Geral Açores', LIA: 'Institucional Açores', LGM: 'Geral Madeira', LIM: 'Institucional Madeira', LGC: 'Geral Continente', LIC: 'Institucional Continente' };

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

export default function BackofficePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('utilizadores');
  const [users, setUsers] = useState<any[]>([]);
  const [destinatarios, setDestinatarios] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [audit, setAudit] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [modalUser, setModalUser] = useState<any>(null);
  const [modalDest, setModalDest] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterLista, setFilterLista] = useState('');
  const [teste, setTeste] = useState<Record<string, { aCorrer?: boolean; ok?: boolean; mensagem?: string }>>({});

  const userFromStorage = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') ?? 'null') : null;
  const isAdmin = userFromStorage?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) { router.push('/'); return; }
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [u, d, c, h, a] = await Promise.all([usersApi.list(), listasApi.list(), systemApi.getConfig(), systemApi.getSaude(), systemApi.getAudit(50)]);
      setUsers(u); setDestinatarios(d); setConfig(c ?? {}); setHealth(h); setAudit(a);
    } catch { router.push('/login'); }
  }

  // Users
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

  // Destinatários
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

  // Config
  async function saveConfig() {
    setSaving(true); setError('');
    const CAMPOS = ['ftpHost', 'ftpUser', 'ftpPassword', 'ftpIncomingDir', 'ftpProcessedDir', 'pollIntervalMs', 'smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'smtpFrom', 'emailRemetente', 'smsSender', 'smsMode', 'envioAutomatico'];
    const dados = Object.fromEntries(CAMPOS.filter(k => config[k] !== undefined && config[k] !== null).map(k => [k, config[k]]));
    try { setConfig(await systemApi.updateConfig(dados)); setMsg('Configuração guardada'); }
    catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function testar(servico: 'smtp' | 'ftp' | 'poll') {
    setTeste(t => ({ ...t, [servico]: { aCorrer: true } }));
    try {
      const r = servico === 'smtp' ? await systemApi.testarSmtp()
        : servico === 'ftp' ? await systemApi.testarFtp()
        : await systemApi.forcarPolling().then(p => ({ ok: !p.erro, mensagem: p.erro ?? `${p.ficheiros} ficheiro(s) processado(s)` }));
      setTeste(t => ({ ...t, [servico]: { ok: r.ok, mensagem: r.mensagem } }));
    } catch (e: any) {
      setTeste(t => ({ ...t, [servico]: { ok: false, mensagem: e.message } }));
    }
  }

  function ResultadoTeste({ servico }: { servico: 'smtp' | 'ftp' | 'poll' }) {
    const r = teste[servico];
    if (!r || r.aCorrer) return null;
    return <div className={`alert ${r.ok ? 'alert-success' : 'alert-error'}`} style={{ margin: '12px 0 0' }}>{r.mensagem}</div>;
  }

  function Origem({ origem }: { origem?: string }) {
    if (!origem) return null;
    return <span className={origem === 'backoffice' ? 'badge badge-info' : 'badge'} title={origem === 'backoffice' ? 'Em uso: valores definidos aqui' : 'Em uso: variáveis de ambiente (.env), porque o host não está definido aqui'}>
      Em uso: {origem === 'backoffice' ? 'backoffice' : '.env'}
    </span>;
  }

  const filteredDests =filterLista ? destinatarios.filter(d => d.lista === filterLista) : destinatarios;

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Backoffice</span>
        {health && <span className={`badge ${health.status === 'ok' ? 'badge-success' : health.status === 'down' ? 'badge-danger' : 'badge-warning'}`}>Sistema: {health.status === 'ok' ? 'operacional' : health.status === 'down' ? 'indisponível' : 'degradado'}</span>}
      </div>

      <div className="page-content">
        {msg && <div className="alert alert-success" onClick={() => setMsg('')}>{msg}</div>}
        {error && <div className="alert alert-error" onClick={() => setError('')}>{error}</div>}

        <div className="tabs">
          {([['utilizadores', 'Utilizadores'], ['mailing', 'Listas de Email'], ['sms', 'Listas de SMS'], ['config', 'Configurações'], ['auditoria', 'Auditoria']] as [Tab, string][]).map(([t, l]) => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>

        {/* UTILIZADORES */}
        {tab === 'utilizadores' && (
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

        {/* MAILING / SMS */}
        {(tab === 'mailing' || tab === 'sms') && (
          <div className="table-wrap">
            <div className="table-header">
              <span className="table-title">{tab === 'mailing' ? 'Listas de Email' : 'Listas de SMS'}</span>
              <select className="form-control" style={{ width: 'auto' }} value={filterLista} onChange={e => setFilterLista(e.target.value)}>
                <option value="">Todas as listas</option>
                {LISTAS.map(l => <option key={l} value={l}>{l} — {LISTA_LABELS[l]}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => setModalDest({ nome: '', organizacao: '', emailRaw: '', telefoneRaw: '', listas: [] })}>
                <Icon d="M12 4v16m8-8H4" size={14} /> Novo
              </button>
            </div>
            <table>
              <thead><tr><th>Nome</th><th>Organização</th><th>{tab === 'mailing' ? 'Email (mascarado)' : 'Telefone (mascarado)'}</th><th>Listas</th><th>Ações</th></tr></thead>
              <tbody>
                {filteredDests.map(d => (
                  <tr key={d.destinatarioId ?? d.id}>
                    <td>{d.destinatario?.nome ?? d.nome}{d.destinatario?.interno && <span className="badge badge-info" style={{ marginLeft: 8 }}>Interno</span>}</td>
                    <td>{d.destinatario?.organizacao ?? d.organizacao ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {tab === 'mailing' ? (d.destinatario?.email ?? d.email) : (d.destinatario?.telefone ?? d.telefone ?? '—')}
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

        {/* CONFIG */}
        {tab === 'config' && (
          <div style={{ maxWidth: 700 }}>
            {health?.componentes && (
              <div className="card">
                <div className="card-title">Saúde do Sistema
                  <span style={{ marginLeft: 'auto' }} className={`badge ${health.status === 'ok' ? 'badge-success' : health.status === 'down' ? 'badge-danger' : 'badge-warning'}`}>
                    {health.status === 'ok' ? 'Operacional' : health.status === 'down' ? 'Indisponível' : 'Degradado'}
                  </span>
                </div>
                {([['db', 'Base de dados PostgreSQL'], ['ftp', 'Polling FTP (XML)'], ['envio', 'Envio de email e SMS'], ['website', 'Publicação no website IPMA'], ['backup', 'Backups']] as [string, string][]).map(([k, label]) => {
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
            )}
            <div className="card">
              <div className="card-title"><Icon d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /> Servidor FTP <span style={{ marginLeft: 'auto' }}><Origem origem={config.origemFtp} /></span></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Host</label><input className="form-control" value={config.ftpHost ?? ''} onChange={e => setConfig((c: any) => ({ ...c, ftpHost: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Utilizador</label><input className="form-control" value={config.ftpUser ?? ''} onChange={e => setConfig((c: any) => ({ ...c, ftpUser: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Password</label><input type="password" className="form-control" autoComplete="new-password" placeholder={config.temFtpPassword ? '•••••••• (definida — deixe vazio para manter)' : 'Não definida'} value={config.ftpPassword ?? ''} onChange={e => setConfig((c: any) => ({ ...c, ftpPassword: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Pasta de entrada</label><input className="form-control" value={config.ftpIncomingDir ?? ''} onChange={e => setConfig((c: any) => ({ ...c, ftpIncomingDir: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Pasta de processados</label><input className="form-control" value={config.ftpProcessedDir ?? ''} onChange={e => setConfig((c: any) => ({ ...c, ftpProcessedDir: e.target.value }))} /></div>
                <div className="form-group">
                  <label className="form-label">Intervalo de polling</label>
                  <select className="form-control" value={config.pollIntervalMs ?? 30000} onChange={e => setConfig((c: any) => ({ ...c, pollIntervalMs: parseInt(e.target.value, 10) }))}>
                    {[[10000, '10 segundos'], [30000, '30 segundos'], [60000, '60 segundos'], [300000, '5 minutos']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    {![10000, 30000, 60000, 300000].includes(config.pollIntervalMs ?? 30000) && <option value={config.pollIntervalMs}>{Math.round(config.pollIntervalMs / 1000)} segundos</option>}
                  </select>
                </div>
              </div>
              <div className="form-hint">Com o host vazio, o sistema usa as variáveis FTP_* do ambiente. Guarde antes de testar.</div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-secondary btn-sm" disabled={teste.ftp?.aCorrer} onClick={() => testar('ftp')}>{teste.ftp?.aCorrer ? 'A testar…' : 'Testar Ligação'}</button>
                <button className="btn btn-secondary btn-sm" disabled={teste.poll?.aCorrer} onClick={() => testar('poll')}>{teste.poll?.aCorrer ? 'A ler…' : 'Forçar Poll'}</button>
              </div>
              <ResultadoTeste servico="ftp" />
              <ResultadoTeste servico="poll" />
            </div>

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
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-secondary btn-sm" disabled={teste.smtp?.aCorrer} onClick={() => testar('smtp')}>{teste.smtp?.aCorrer ? 'A testar…' : 'Testar Ligação'}</button>
              </div>
              <ResultadoTeste servico="smtp" />
            </div>

            <div className="card">
              <div className="card-title"><Icon d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /> Gateway SMS (SMSExpress MEO)</div>
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
            </div>

            <div className="card">
              <div className="card-title">Website IPMA
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

            <div className="card">
              <div className="card-title">Fluxo automático (XML via FTP)</div>
              <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="checkbox" style={{ marginTop: 3, accentColor: 'var(--accent)' }} checked={!!config.envioAutomatico} onChange={e => setConfig((c: any) => ({ ...c, envioAutomatico: e.target.checked }))} />
                <span>
                  <span className="field-label">Aprovar e enviar automaticamente</span>
                  <span className="form-hint" style={{ display: 'block', marginTop: 2 }}>
                    Quando ativo, cada XML recebido do Centro de Operações é aprovado e enviado por email e SMS para as listas indicadas em emailKey/smsKey.
                    Se o texto do template ficar com marcadores por preencher (p.ex. [--info macrossísmica detalhada--]) ou o XML não indicar listas, o comunicado fica em rascunho para o analista.
                  </span>
                </span>
              </label>
              {config.envioAutomatico && config.smsMode !== 'production' && (
                <div className="alert alert-info" style={{ margin: '12px 0 0' }}>Com o modo de envio em Teste, os envios automáticos vão apenas para os endereços internos.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" disabled={saving} onClick={saveConfig}>{saving ? 'A guardar…' : 'Guardar Configurações'}</button>
            </div>
          </div>
        )}

        {/* AUDITORIA */}
        {tab === 'auditoria' && (
          <div className="table-wrap">
            <div className="table-header"><span className="table-title">Registo de Auditoria</span></div>
            <table>
              <thead><tr><th>Data</th><th>Utilizador</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead>
              <tbody>
                {audit.map((a: any) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(a.criadoEm).toLocaleString('pt-PT')}</td>
                    <td>{a.user?.name ?? '—'}</td>
                    <td><span className="badge badge-enviado">{a.acao}</span></td>
                    <td>{a.entidade}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a.detalhes ? JSON.stringify(a.detalhes) : '—'}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Sem registos</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal User */}
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
