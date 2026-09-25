'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { comunicadosApi, deliveryApi, abrirPdf } from '../../lib/api';

const ESTADO_LABELS: Record<string, string> = {
  RASCUNHO: 'Ativo', PENDENTE: 'Pendente', APROVADO: 'Ativo',
  ENVIADO: 'Enviado', CANCELADO: 'Cancelado', ARQUIVADO: 'Arquivado',
};
const WEBSITE_LABEL: Record<string, string> = { NAO_PUBLICADO: 'Não publicado', PUBLICADO: 'Publicado', REMOVIDO: 'Retirado', ERRO: 'Erro' };
const WEBSITE_BADGE: Record<string, string> = { PUBLICADO: 'badge-success', ERRO: 'badge-danger', REMOVIDO: '' };
const LISTAS = ['LGA', 'LIA', 'LGM', 'LIM', 'LGC', 'LIC'];
const LISTA_LABELS: Record<string, string> = {
  LGA: 'Geral Açores', LIA: 'Institucional Açores', LGM: 'Geral Madeira',
  LIM: 'Institucional Madeira', LGC: 'Geral Continente', LIC: 'Institucional Continente',
};

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export default function ComunicadoPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'info' | 'versoes' | 'envio'>('info');
  const [action, setAction] = useState('');
  const [showEnviarModal, setShowEnviarModal] = useState(false);
  const [selectedVersao, setSelectedVersao] = useState('');
  const [selectedListas, setSelectedListas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');
  const [emailHtml, setEmailHtml] = useState('');

  useEffect(() => {
    comunicadosApi.get(id).then(d => { setItem(d); setLoading(false); }).catch(() => router.push('/'));
  }, [id]);

  async function doAction(fn: () => Promise<any>, label: string) {
    setAction(label);
    try { const d = await fn(); setItem(d); setMsg(`${label} com sucesso`); } catch (e: any) { setMsg(`Erro: ${e.message}`); }
    setAction('');
  }

  async function doWebsite(op: 'publicar' | 'remover') {
    setAction(op);
    try {
      const r = op === 'publicar' ? await comunicadosApi.publicarWebsite(id) : await comunicadosApi.removerWebsite(id);
      setMsg(r.ok ? r.mensagem : `Website: ${r.mensagem}`);
      setItem(await comunicadosApi.get(id));
    } catch (e: any) { setMsg(`Erro: ${e.message}`); }
    setAction('');
  }

  async function enviar() {
    if (!selectedVersao || selectedListas.length === 0) return;
    setEnviando(true);
    try {
      await deliveryApi.enviar(id, selectedVersao, selectedListas);
      setMsg('Comunicado enviado com sucesso');
      setShowEnviarModal(false);
      const d = await comunicadosApi.get(id); setItem(d);
    } catch (e: any) { setMsg(`Erro: ${e.message}`); }
    setEnviando(false);
  }

  function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) return <><div className="topbar"><span className="topbar-title">Comunicado</span></div><div className="page-content"><div className="skeleton" style={{ height: 300 }} /></div></>;

  const ultimaVersao = item.versoes?.[item.versoes.length - 1];

  return (
    <>
      <div className="topbar">
        <button className="btn-icon" onClick={() => router.back()}><Icon d="M15 19l-7-7 7-7" /></button>
        <span className="topbar-title" style={{ flex: 1 }}>{item.referencia} — {item.titulo}</span>
        <div className="topbar-actions">
          <span className={`badge badge-${item.estado.toLowerCase()}`}>{ESTADO_LABELS[item.estado]}</span>
          {item.estado === 'RASCUNHO' && <button className="btn btn-secondary btn-sm" disabled={!!action} onClick={() => doAction(() => comunicadosApi.aprovar(id), 'Aprovado')}>{action === 'Aprovado' ? '…' : 'Ativar'}</button>}
          {item.estado === 'APROVADO' && <button className="btn btn-primary btn-sm" onClick={() => { setSelectedVersao(ultimaVersao?.id ?? ''); setShowEnviarModal(true); }}>Enviar</button>}
          {['RASCUNHO', 'APROVADO'].includes(item.estado) && <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/comunicados/${id}/editar`)}>Editar</button>}
          {!['CANCELADO', 'ARQUIVADO'].includes(item.estado) && <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/comunicados/novo?versaoDe=${id}`)}>Nova versão</button>}
        </div>
      </div>

      <div className="page-content">
        {msg && <div className="alert alert-success">{msg}</div>}

        <div className="tabs">
          {(['info', 'versoes', 'envio'] as const).map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'info' ? 'Informação' : t === 'versoes' ? `Versões (${item.versoes?.length ?? 0})` : 'Envio'}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-title">Dados do Evento</div>
              {[
                ['Referência', item.referencia],
                ['Template', item.templateId],
                ['Área', item.areaName],
                ['Local', item.local ?? '—'],
                ['Data/Hora Evento', formatDate(item.eventDateTime)],
                ['Magnitude', item.magnitude != null ? `${item.magnitude} Richter` : '—'],
                ['Lat / Lon', item.lat != null ? `${item.lat} / ${item.lon}` : '—'],
                ['Profundidade', item.depth != null ? `${item.depth} km` : '—'],
                ['Intmax', item.intmax ?? '—'],
                ['Região Intmax', item.regiaoIntmax ?? '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
                  <span style={{ width: 160, flexShrink: 0, fontWeight: 600, color: 'var(--text-muted)' }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title">Texto</div>
              <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.texto}</div>
            </div>
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-title">Website IPMA
                <span style={{ marginLeft: 'auto' }} className={`badge ${WEBSITE_BADGE[item.websiteEstado] ?? ''}`}>{WEBSITE_LABEL[item.websiteEstado] ?? item.websiteEstado}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {item.websiteEstado === 'PUBLICADO' && `Versão ${String(item.websiteVersao ?? 1).padStart(3, '0')} publicada em ${formatDate(item.websitePublicadoEm)}${item.primeiraPagina ? ' · destaque na página inicial' : ''}`}
                  {item.websiteEstado === 'ERRO' && `Falhou: ${item.websiteErro ?? 'erro desconhecido'}`}
                  {item.websiteEstado === 'NAO_PUBLICADO' && 'É publicado automaticamente quando o comunicado é enviado (se estiver ativo).'}
                  {item.websiteEstado === 'REMOVIDO' && 'Retirado do website.'}
                </span>
                <span className="row">
                  {item.ativo && !['CANCELADO', 'ARQUIVADO'].includes(item.estado) && item.versoes?.length > 0 && (
                    <button className="btn btn-secondary btn-sm" disabled={!!action} onClick={() => doWebsite('publicar')}>
                      {action === 'publicar' ? 'A publicar…' : item.websiteEstado === 'PUBLICADO' ? 'Atualizar no website' : 'Publicar agora'}
                    </button>
                  )}
                  {['PUBLICADO', 'ERRO'].includes(item.websiteEstado) && (
                    <button className="btn btn-ghost btn-sm" disabled={!!action} onClick={() => doWebsite('remover')}>{action === 'remover' ? 'A retirar…' : 'Retirar do website'}</button>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === 'versoes' && (
          <div className="card">
            <div className="card-title">Histórico de Versões</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Versão</th><th>Título</th><th>PDF</th></tr></thead>
              <tbody>
                {item.versoes?.map((v: any) => (
                  <tr key={v.id}>
                    <td><span className="mono">v{String(v.numero).padStart(3, '0')}</span></td>
                    <td>{v.titulo}</td>
                    <td>
                      {v.pdfPath && (
                        <div className="row">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirPdf(id, v.id).catch(() => undefined)}>
                            <Icon d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" size={14} /> PDF
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => deliveryApi.emailPreview(id, v.id).then(r => setEmailHtml(r.html)).catch(() => undefined)}>
                            Pré-visualizar email
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'envio' && (
          <div style={{ display: 'grid', gap: 20 }}>
            {item.versoes?.map((v: any) => (
              <div key={v.id} className="card">
                <div className="card-title">Versão v{v.numero}</div>
                {v.emailEnvios?.length === 0 && v.smsEnvios?.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum envio registado</div>}
                {v.emailEnvios?.map((e: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
                    <strong>Email {e.lista}</strong>: {e.totalEnviado} enviados, {e.totalFalha} falhas — <span className={`badge ${e.sucesso ? 'badge-ok' : 'badge-fail'}`}>{e.sucesso ? 'OK' : 'ERRO'}</span>
                  </div>
                ))}
                {v.smsEnvios?.map((s: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
                    <strong>SMS {s.lista}</strong>: {s.totalEnviado} enviados, {s.totalFalha} falhas — <span className={`badge ${s.sucesso ? 'badge-ok' : 'badge-fail'}`}>{s.sucesso ? 'OK' : 'ERRO'}</span>
                    <div className="sms-preview" style={{ marginTop: 8 }}>{s.mensagem}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enviar Modal */}
      {showEnviarModal && (
        <div className="modal-overlay" onClick={() => setShowEnviarModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirmar Envio</h2>
              <button className="btn-icon" onClick={() => setShowEnviarModal(false)}><Icon d="M6 18L18 6M6 6l12 12" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Versão a enviar</label>
                <select className="form-control" value={selectedVersao} onChange={e => setSelectedVersao(e.target.value)}>
                  {item.versoes?.map((v: any) => <option key={v.id} value={v.id}>v{v.numero} — {v.titulo}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Listas de distribuição</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LISTAS.map(l => (
                    <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedListas.includes(l)} onChange={() => setSelectedListas(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])} />
                      <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{l}</span> {LISTA_LABELS[l]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="alert alert-warning" style={{ margin: 0 }}>
                Esta ação enviará emails e SMS para todos os destinatários das listas selecionadas. Confirme antes de prosseguir.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEnviarModal(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={enviando || !selectedVersao || selectedListas.length === 0} onClick={enviar}>
                {enviando ? 'A enviar…' : 'Confirmar Envio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailHtml && (
        <div className="modal-backdrop" onClick={() => setEmailHtml('')}>
          <div className="modal" style={{ width: 'min(720px, 100%)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Pré-visualização do email</div>
                <div className="modal-sub">Corpo HTML tal como chega ao destinatário. O PDF segue em anexo.</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEmailHtml('')}>✕</button>
            </div>
            <div className="modal-body">
              <iframe title="Pré-visualização do email" sandbox="" srcDoc={emailHtml} style={{ width: '100%', height: '65vh', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
