'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { comunicadosApi, deliveryApi } from '../../lib/api';
import { construirSms, partes, zonaDaArea, SMS_MAX_CHARS } from '../../lib/sms';

const LISTAS = ['LGA', 'LIA', 'LGM', 'LIM', 'LGC', 'LIC'] as const;
const LISTA_INFO: Record<string, { label: string; badge: string }> = {
  LGA: { label: 'Lista Geral Açores', badge: 'badge badge-info' },
  LIA: { label: 'Lista Institucional Açores', badge: 'badge badge-info' },
  LGM: { label: 'Lista Geral Madeira', badge: 'badge badge-success' },
  LIM: { label: 'Lista Institucional Madeira', badge: 'badge badge-success' },
  LGC: { label: 'Lista Geral Continente', badge: 'badge badge-warning' },
  LIC: { label: 'Lista Institucional Continente', badge: 'badge badge-warning' },
};
const INTENSIDADES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

type Form = {
  templateId: string; areaName: string; local: string; eventDateTime: string;
  lat: string; lon: string; depth: string; magnitude: string;
  intmax: string; regiaoIntmax: string; infoMacrossAdicional: string;
  primeiraPagina: boolean; ativo: boolean; titulo: string; texto: string; imagemUrl: string;
  emailListas: string[]; smsListas: string[];
};

const FORM_VAZIO: Form = {
  templateId: '0000', areaName: 'Continente', local: '', eventDateTime: '',
  lat: '', lon: '', depth: '', magnitude: '', intmax: '', regiaoIntmax: '', infoMacrossAdicional: '',
  primeiraPagina: false, ativo: true, titulo: '', texto: '', imagemUrl: '', emailListas: [], smsListas: [],
};

function Svg({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24">{children}</svg>;
}

const paraInputUtc = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
const doInputUtc = (v: string) => (v ? `${v}:00Z` : undefined);
const numero = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
const str = (v: unknown) => (v == null ? '' : String(v));

function linhasEvento(f: Form): [string, string][] {
  const out: [string, string][] = [];
  const dt = f.eventDateTime ? new Date(`${f.eventDateTime}:00Z`) : null;
  if (dt && !Number.isNaN(dt.getTime())) {
    const l = partes(dt, zonaDaArea(f.areaName)), u = partes(dt, 'UTC');
    out.push(['Data e hora', `${l.d}-${l.mo}-${l.y} ${l.h}:${l.mi} (hora local) · ${u.h}:${u.mi} UTC`]);
  }
  if (f.local) out.push(['Epicentro', f.local]);
  out.push(['Área', f.areaName]);
  const lat = numero(f.lat), lon = numero(f.lon);
  if (lat != null && lon != null) out.push(['Coordenadas', `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`]);
  if (numero(f.depth) != null) out.push(['Profundidade', `${Number(f.depth).toFixed(1)} km`]);
  if (numero(f.magnitude) != null) out.push(['Magnitude', `${Number(f.magnitude).toFixed(1)} (Richter)`]);
  if (f.intmax) out.push(['Intensidade máxima', f.intmax]);
  if (f.regiaoIntmax) out.push(['Região de intensidade máxima', f.regiaoIntmax]);
  return out;
}

// ─── Template placeholder editor ────────────────────────────────────────────

const PH_RE = /\[[^\]\n]*\]|\{m\.m\]/g;
type Seg = { t: 'text'; v: string } | { t: 'ph'; marker: string };

function parseSegs(texto: string): Seg[] {
  const segs: Seg[] = [];
  const re = new RegExp(PH_RE.source, 'g');
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > last) segs.push({ t: 'text', v: texto.slice(last, m.index) });
    segs.push({ t: 'ph', marker: m[0] });
    last = m.index + m[0].length;
  }
  if (last < texto.length) segs.push({ t: 'text', v: texto.slice(last) });
  return segs;
}

function phLabel(marker: string): string {
  return marker.replace(/^[\[{]|[\]}]$/g, '').replace(/^-+\s*|\s*-+$/g, '').trim();
}

function TemplateEditor({ rawTemplate, phValues, onChange }: {
  rawTemplate: string;
  phValues: Record<string, string>;
  onChange: (marker: string, value: string) => void;
}) {
  const segs = parseSegs(rawTemplate);
  const hasPh = segs.some(s => s.t === 'ph');
  return (
    <div style={{
      whiteSpace: 'pre-wrap', lineHeight: 1.85, padding: '12px 14px',
      background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)',
      fontSize: 13, color: 'var(--text-1)', minHeight: 180, wordBreak: 'break-word',
    }}>
      {hasPh
        ? segs.map((s, i) => {
            if (s.t === 'text') return <span key={i}>{s.v}</span>;
            const label = phLabel(s.marker);
            const w = Math.min(Math.max(label.length * 8 + 28, 64), 300);
            const filled = !!(phValues[s.marker]);
            return (
              <input
                key={`${s.marker}-${i}`}
                type="text"
                value={phValues[s.marker] ?? ''}
                placeholder={label}
                onChange={e => onChange(s.marker, e.target.value)}
                title={s.marker}
                style={{
                  display: 'inline-block', width: w,
                  background: filled ? 'rgba(34,197,94,0.07)' : 'rgba(34,197,94,0.18)',
                  border: `1.5px solid ${filled ? '#86efac' : 'var(--accent,#22c55e)'}`,
                  borderRadius: 4, padding: '1px 6px', fontSize: '0.88em',
                  fontFamily: 'var(--font-mono)', color: filled ? 'var(--text-1)' : 'var(--accent)',
                  outline: 'none', verticalAlign: 'text-bottom', lineHeight: '1.5', cursor: 'text',
                }}
              />
            );
          })
        : rawTemplate
      }
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function NovoComunicado() {
  const router = useRouter();
  const params = useSearchParams();
  const versaoDe = params.get('versaoDe');

  const [templates, setTemplates] = useState<{ id: string; label: string }[]>([]);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [textoEditado, setTextoEditado] = useState(false);
  const [rawTemplate, setRawTemplate] = useState('');
  const [phValues, setPhValues] = useState<Record<string, string>>({});
  const [base, setBase] = useState<any>(null);
  const [xml, setXml] = useState<{ fonte: string; nome: string; origem: any } | null>(null);
  const [correspondente, setCorrespondente] = useState<any>(null);
  const [passo, setPasso] = useState<1 | 2 | 3>(versaoDe ? 2 : 1);
  const [arrastar, setArrastar] = useState(false);
  const [imagemPreview, setImagemPreview] = useState('');
  const [aCarregar, setACarregar] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState('');
  const [envio, setEnvio] = useState<{ comunicadoId: string; versaoId: string; referencia: string; versao: number } | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const xmlInput = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('user') ?? 'null')); } catch { setUser(null); }
    comunicadosApi.templates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (!versaoDe) return;
    comunicadosApi.get(versaoDe).then(c => {
      setBase(c);
      setForm({
        templateId: c.templateId, areaName: c.areaName, local: str(c.local), eventDateTime: paraInputUtc(c.eventDateTime),
        lat: str(c.lat), lon: str(c.lon), depth: str(c.depth), magnitude: str(c.magnitude),
        intmax: str(c.intmax), regiaoIntmax: str(c.regiaoIntmax), infoMacrossAdicional: str(c.infoMacrossAdicional),
        primeiraPagina: c.primeiraPagina, ativo: c.ativo, titulo: c.titulo, texto: c.texto, imagemUrl: str(c.imagemUrl),
        emailListas: c.emailListas ?? [], smsListas: c.smsListas ?? [],
      });
      setTextoEditado(true);
      setRawTemplate(c.texto);
    }).catch(() => setErro('Comunicado de origem não encontrado'));
  }, [versaoDe]);

  // Preenche o texto do template com os dados do evento enquanto o analista não o editar.
  useEffect(() => {
    if (textoEditado || passo === 1) return;
    const t = setTimeout(() => {
      comunicadosApi.preencher({
        templateId: form.templateId, areaName: form.areaName, eventDateTime: doInputUtc(form.eventDateTime),
        magnitude: numero(form.magnitude), local: form.local || undefined, intmax: form.intmax || undefined,
        regiaoIntmax: form.regiaoIntmax || undefined, infoMacrossAdicional: form.infoMacrossAdicional || undefined,
      }).then(r => { setForm(f => ({ ...f, texto: r.texto })); setRawTemplate(r.texto); setPhValues({}); }).catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [textoEditado, passo, form.templateId, form.areaName, form.eventDateTime, form.magnitude, form.local, form.intmax, form.regiaoIntmax, form.infoMacrossAdicional]);

  function set<K extends keyof Form>(k: K, v: Form[K]) { setForm(f => ({ ...f, [k]: v })); }

  function toggleLista(tipo: 'emailListas' | 'smsListas', l: string) {
    setForm(f => ({ ...f, [tipo]: f[tipo].includes(l) ? f[tipo].filter(x => x !== l) : [...f[tipo], l] }));
  }

  function handlePlaceholderChange(marker: string, value: string) {
    const newPh = { ...phValues, [marker]: value };
    setPhValues(newPh);
    const tpl = rawTemplate || form.texto;
    const segs = parseSegs(tpl);
    const newTexto = segs.map(s => s.t === 'text' ? s.v : (newPh[s.marker] || s.marker)).join('');
    setForm(f => ({ ...f, texto: newTexto }));
    setTextoEditado(true);
  }

  async function carregarXml(file?: File | null) {
    if (!file) return;
    setErro(''); setACarregar(true);
    try {
      const [r, fonte] = await Promise.all([comunicadosApi.analisarXml(file), file.text()]);
      const d = r.dados;
      setForm(f => ({
        ...f,
        templateId: d.templateId, areaName: d.areaName, local: d.local, eventDateTime: paraInputUtc(d.eventDateTime),
        lat: str(d.lat), lon: str(d.lon), depth: str(d.depth), magnitude: str(d.magnitude),
        intmax: d.intmax, regiaoIntmax: d.regiaoIntmax, infoMacrossAdicional: d.infoMacrossAdicional,
        primeiraPagina: d.primeiraPagina, ativo: d.ativo,
        titulo: base ? f.titulo : r.titulo, texto: r.texto,
        emailListas: d.emailListas, smsListas: d.smsListas,
      }));
      setTextoEditado(false);
      setPhValues({});
      setXml({ fonte, nome: file.name, origem: r.origem });
      setCorrespondente(!base && r.correspondente ? r.correspondente : null);
      setPasso(2);
    } catch (e: any) {
      setErro(e.message ?? 'Não foi possível ler o XML');
    }
    setACarregar(false);
    if (xmlInput.current) xmlInput.current.value = '';
  }

  async function carregarImagem(file?: File | null) {
    if (!file) return;
    setErro('');
    try {
      const { imagemUrl } = await comunicadosApi.uploadImagem(file);
      set('imagemUrl', imagemUrl);
      setImagemPreview(URL.createObjectURL(file));
    } catch (e: any) { setErro(e.message); }
  }

  async function usarComoNovaVersao() {
    if (!correspondente) return;
    const c = await comunicadosApi.get(correspondente.id);
    setBase(c);
    setForm(f => ({ ...f, titulo: c.titulo }));
    setCorrespondente(null);
  }

  function validar(): string | null {
    if (!form.titulo.trim()) return 'O título é obrigatório';
    if (!form.texto.trim()) return 'O texto é obrigatório';
    return null;
  }

  async function guardar(): Promise<{ comunicadoId: string; versaoId: string; referencia: string; versao: number }> {
    const payload = {
      templateId: form.templateId, titulo: form.titulo.trim(), texto: form.texto,
      local: form.local || undefined, lat: numero(form.lat), lon: numero(form.lon), depth: numero(form.depth), magnitude: numero(form.magnitude),
      intmax: form.intmax || undefined, regiaoIntmax: form.regiaoIntmax || undefined, infoMacrossAdicional: form.infoMacrossAdicional || undefined,
      primeiraPagina: form.primeiraPagina, ativo: form.ativo, imagemUrl: form.imagemUrl || undefined,
      emailListas: form.emailListas, smsListas: form.smsListas, xmlFonte: xml?.fonte,
    };
    if (base) {
      const v = await comunicadosApi.novaVersao(base.id, payload);
      return { comunicadoId: base.id, versaoId: v.id, referencia: base.referencia, versao: v.numero };
    }
    const c = await comunicadosApi.create({ ...payload, areaName: form.areaName, eventDateTime: doInputUtc(form.eventDateTime) });
    return { comunicadoId: c.id, versaoId: c.versoes[0].id, referencia: c.referencia, versao: 1 };
  }

  async function guardarRascunho() {
    const v = validar(); if (v) { setErro(v); return; }
    setAGuardar(true); setErro('');
    try { const r = await guardar(); router.push(`/comunicados/${r.comunicadoId}`); }
    catch (e: any) { setErro(e.message); setAGuardar(false); }
  }

  async function aprovarEEnviar() {
    const v = validar(); if (v) { setErro(v); return; }
    if (!form.emailListas.length && !form.smsListas.length) { setErro('Selecione pelo menos uma lista de email ou SMS'); return; }
    setAGuardar(true); setErro('');
    try {
      const r = await guardar();
      await comunicadosApi.aprovar(r.comunicadoId);
      setBase((b: any) => b ?? { id: r.comunicadoId, referencia: r.referencia, versoes: [], estado: 'APROVADO' });
      setEnvio(r); setPasso(3);
    } catch (e: any) { setErro(e.message); }
    setAGuardar(false);
  }

  async function confirmarEnvio() {
    if (!envio) return;
    setAEnviar(true);
    try {
      const r = await deliveryApi.enviarListas(envio.comunicadoId, envio.versaoId, form.emailListas, form.smsListas);
      // Com falhas, o analista vai para o detalhe (estado por lista) em vez do dashboard.
      router.push(r.falhas ? `/comunicados/${envio.comunicadoId}` : '/');
    } catch (e: any) { setErro(e.message); setEnvio(null); setAEnviar(false); }
  }

  const jaEnviado = !!base && (base.estado === 'ENVIADO' || base.versoes?.some((v: any) => v.emailEnvios?.length || v.smsEnvios?.length));
  const proximaVersao = base ? Math.max(0, ...(base.versoes ?? []).map((v: any) => v.numero)) + 1 : 1;
  const sms = construirSms({ areaName: form.areaName, eventDateTime: doInputUtc(form.eventDateTime), local: form.local, magnitude: form.magnitude });
  const tituloPagina = base ? `Nova versão — ${base.referencia}` : 'Novo Comunicado Sismológico';

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <span className="eyebrow">Operação</span>
          <h1 className="page-title">{tituloPagina}</h1>
          <p className="page-sub">{base ? `A versão ${String(proximaVersao).padStart(3, '0')} mantém a referência ${base.referencia}` : 'Carregue o ficheiro XML do evento ou preencha os dados manualmente'}</p>
        </div>
        <div className="page-actions"><button className="btn btn-ghost" onClick={() => router.back()}>Cancelar</button></div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--shell-gap)' }}>
        <div className="wizard-steps">
          {['Ficheiro / Dados', 'Editar & Pré-visualizar', 'Distribuição & Envio'].map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const estado = passo > n ? 'done' : passo === n ? 'active' : '';
            return (
              <div key={label} className={`wizard-step ${estado}`}>
                <span className="step-circle">{passo > n ? '✓' : n}</span>
                <span className="step-label">{label}</span>
                {n < 3 && <span className="step-line" />}
              </div>
            );
          })}
        </div>
      </div>

      {erro && <div className="alert alert-error">{erro}</div>}

      <input ref={xmlInput} type="file" accept=".xml,text/xml,application/xml" hidden onChange={e => carregarXml(e.target.files?.[0])} />

      {passo === 1 && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Ficheiro XML do evento</div>
            <div
              className={`upload-zone${arrastar ? ' drag' : ''}`}
              role="button" tabIndex={0}
              onClick={() => xmlInput.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') xmlInput.current?.click(); }}
              onDragOver={e => { e.preventDefault(); setArrastar(true); }}
              onDragLeave={() => setArrastar(false)}
              onDrop={e => { e.preventDefault(); setArrastar(false); carregarXml(e.dataTransfer.files?.[0]); }}
            >
              <Svg><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></Svg>
              <strong style={{ color: 'var(--text-heading)' }}>{aCarregar ? 'A analisar…' : 'Arraste o ficheiro .xml ou clique para escolher'}</strong>
              <span className="form-hint">Mesmo formato do ficheiro automático, com a informação macrossísmica (intmax, regiao_intmax, info_macross_adicional).</span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Sem ficheiro</div>
            <p className="page-sub" style={{ marginBottom: 16 }}>Para comunicados genéricos ou quando o ficheiro não está disponível, preencha os dados do evento à mão.</p>
            <button className="btn btn-secondary" onClick={() => setPasso(2)}>Preencher manualmente</button>
          </div>
        </div>
      )}

      {passo >= 2 && (
        <>
          {xml && (
            <div className="alert alert-info">
              <div className="xml-meta">
                <span><strong>XML:</strong> {xml.nome}</span>
                {xml.origem?.criadoPor && <span><strong>Criado por:</strong> {xml.origem.criadoPor}</span>}
                {xml.origem?.criadoEm && <span><strong>Em:</strong> {xml.origem.criadoEm.replace('T', ' ')}</span>}
                <span>{xml.origem?.temInfoMacrossismica ? 'Inclui informação macrossísmica' : 'Sem informação macrossísmica'}</span>
              </div>
            </div>
          )}

          {correspondente && (
            <div className="alert alert-warning">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Este evento já tem o comunicado <strong>{correspondente.referencia}</strong> ({correspondente.versoes} versão(ões)). Quer criar uma nova versão desse comunicado?</span>
                <span className="row">
                  <button className="btn btn-primary btn-sm" onClick={usarComoNovaVersao}>Criar nova versão</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCorrespondente(null)}>Criar comunicado novo</button>
                </span>
              </div>
            </div>
          )}

          <div className="grid-2">
            <div className="stack">
              <div className="card">
                <div className="card-head">
                  <h2 className="card-title">Dados do Evento</h2>
                  <button className="btn btn-secondary btn-sm" onClick={() => xmlInput.current?.click()} disabled={aCarregar}>
                    <Svg><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></Svg>
                    {aCarregar ? 'A analisar…' : 'Importar XML'}
                  </button>
                </div>
                <div className="stack" style={{ gap: 12 }}>
                  <div className="grid-2" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="field">
                      <label className="field-label">Template</label>
                      <select className="select" value={form.templateId} onChange={e => { set('templateId', e.target.value); setTextoEditado(false); }}>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.id} — {t.label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label">Área</label>
                      <select className="select" value={form.areaName} onChange={e => set('areaName', e.target.value)} disabled={!!base}>
                        <option>Continente</option><option>Açores</option><option>Madeira</option>
                      </select>
                    </div>
                  </div>
                  <div className="field"><label className="field-label">Localização (referência geográfica)</label><input className="input" value={form.local} onChange={e => set('local', e.target.value)} placeholder="a cerca de 30 km a Sudoeste de Faro" /></div>
                  <div className="grid-3">
                    <div className="field"><label className="field-label">Data e Hora (UTC)</label><input className="input" type="datetime-local" value={form.eventDateTime} onChange={e => set('eventDateTime', e.target.value)} disabled={!!base} /></div>
                    <div className="field"><label className="field-label">Latitude (°)</label><input className="input" type="number" step="0.01" value={form.lat} onChange={e => set('lat', e.target.value)} /></div>
                    <div className="field"><label className="field-label">Longitude (°)</label><input className="input" type="number" step="0.01" value={form.lon} onChange={e => set('lon', e.target.value)} /></div>
                  </div>
                  <div className="grid-3">
                    <div className="field"><label className="field-label">Profundidade (km)</label><input className="input" type="number" step="0.1" value={form.depth} onChange={e => set('depth', e.target.value)} /></div>
                    <div className="field"><label className="field-label">Magnitude (ML)</label><input className="input" type="number" step="0.1" value={form.magnitude} onChange={e => set('magnitude', e.target.value)} /></div>
                    <div className="field">
                      <label className="field-label">Intensidade Máx.</label>
                      <select className="select" value={form.intmax} onChange={e => set('intmax', e.target.value)}>
                        <option value="">—</option>
                        {form.intmax && !INTENSIDADES.includes(form.intmax) && <option value={form.intmax}>{form.intmax}</option>}
                        {INTENSIDADES.map(i => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field"><label className="field-label">Região de intensidade máxima</label><input className="input" value={form.regiaoIntmax} onChange={e => set('regiaoIntmax', e.target.value)} placeholder="Albufeira" /></div>
                  <div className="field"><label className="field-label">Info macrossísmica adicional</label><textarea className="textarea" value={form.infoMacrossAdicional} onChange={e => set('infoMacrossAdicional', e.target.value)} placeholder="Relatos da população..." /></div>
                  <div className="row" style={{ gap: 20 }}>
                    <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={form.primeiraPagina} onChange={e => set('primeiraPagina', e.target.checked)} style={{ accentColor: 'var(--accent)' }} /><span className="field-label">Página inicial</span></label>
                    <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} style={{ accentColor: 'var(--accent)' }} /><span className="field-label">Ativo</span></label>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h2 className="card-title">Texto do Comunicado</h2>
                  {textoEditado && <button className="btn btn-ghost btn-sm" onClick={() => { setTextoEditado(false); setPhValues({}); }}>Repor texto do template</button>}
                </div>
                <div className="stack" style={{ gap: 12 }}>
                  <div className="field"><label className="field-label">Título</label><input className="input" value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Sismo de magnitude 2.6 — a cerca de 30 km a Sudoeste de Faro" /></div>
                  <div className="field">
                    <label className="field-label">Texto</label>
                    {form.templateId !== '0000' && !base && (rawTemplate || form.texto) ? (
                      <TemplateEditor
                        rawTemplate={rawTemplate || form.texto}
                        phValues={phValues}
                        onChange={handlePlaceholderChange}
                      />
                    ) : (
                      <textarea className="textarea" rows={14} value={form.texto} onChange={e => { set('texto', e.target.value); setTextoEditado(true); }} />
                    )}
                    <span className="form-hint">
                      {form.templateId !== '0000' && !base
                        ? 'Preencha os campos assinalados a verde. O restante texto é gerado pelo template e não pode ser alterado directamente.'
                        : 'Texto oficial do template preenchido com os dados do evento. Os marcadores entre [ ] que ficarem por preencher devem ser completados.'}
                    </span>
                  </div>
                  <div className="field">
                    <label className="field-label">Imagem (mapa de intensidades)</label>
                    <div className="row">
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                        {form.imagemUrl ? 'Substituir imagem' : 'Anexar imagem'}
                        <input type="file" accept="image/png,image/jpeg" hidden onChange={e => carregarImagem(e.target.files?.[0])} />
                      </label>
                      {form.imagemUrl && <><span className="form-hint">Imagem anexada ao PDF e ao email</span><button className="btn btn-ghost btn-sm" onClick={() => { set('imagemUrl', ''); setImagemPreview(''); }}>Remover</button></>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-title">Listas de Distribuição</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
                  {(['emailListas', 'smsListas'] as const).map(tipo => (
                    <div key={tipo}>
                      <div className="field-label" style={{ marginBottom: 8 }}>{tipo === 'emailListas' ? 'Email' : 'SMS'}</div>
                      <div className="check-grid">
                        {LISTAS.map(l => (
                          <label key={l} className={`check-item${form[tipo].includes(l) ? ' checked' : ''}`} title={LISTA_INFO[l].label}>
                            <input type="checkbox" checked={form[tipo].includes(l)} onChange={() => toggleLista(tipo, l)} />{l}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="field">
                  <label className="field-label">SMS gerado automaticamente (não editável)</label>
                  <div className="sms-preview">{sms}</div>
                  <div className="sms-count">{sms.length} / {SMS_MAX_CHARS} caracteres · Sem acentos conforme protocolo</div>
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => router.back()} disabled={aGuardar}>Cancelar</button>
                <button className="btn btn-secondary" onClick={guardarRascunho} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar Rascunho'}</button>
                <button className="btn btn-primary" onClick={aprovarEEnviar} disabled={aGuardar}>
                  <Svg><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Svg>
                  Aprovar e Enviar
                </button>
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <div className="card-title">Pré-visualização</div>
                <div className="doc-preview">
                  <div style={{ textAlign: 'center', marginBottom: 12 }}><img src="/ipma-logo.png" alt="IPMA" style={{ height: 52, objectFit: 'contain' }} /></div>
                  <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: 'var(--text-heading)', marginBottom: 4 }}>{(form.titulo || 'Título do comunicado').toUpperCase()}</p>
                  <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
                    {base?.referencia ?? 'SISM-AAAA-···· (atribuída ao guardar)'} · v{String(proximaVersao).padStart(3, '0')}
                  </p>
                  <hr className="divider" style={{ margin: '8px 0 16px' }} />
                  {linhasEvento(form).map(([k, v]) => <p key={k}><strong>{k}:</strong> {v}</p>)}
                  <hr className="divider" style={{ margin: '16px 0 8px' }} />
                  <div className="doc-text">{form.texto || '—'}</div>
                  {imagemPreview && <img src={imagemPreview} alt="Mapa de intensidades" style={{ display: 'block', margin: '16px auto 0', maxHeight: 280 }} />}
                  {!imagemPreview && form.imagemUrl && <p className="form-hint" style={{ marginTop: 12 }}>Imagem anexada (visível no PDF e no email)</p>}
                  <hr className="divider" style={{ margin: '16px 0 8px' }} />
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Emitido por: Instituto Português do Mar e da Atmosfera, I.P.</p>
                  {user?.name && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Técnico Responsável: {user.name}</p>}
                </div>
              </div>
              <div className="card">
                <div className="card-title">Legenda das Listas</div>
                <div className="stack" style={{ gap: 6 }}>
                  {LISTAS.map(l => (
                    <div key={l} className="row"><span className={LISTA_INFO[l].badge}>{l}</span><span style={{ fontSize: 12, color: 'var(--text-3)' }}>{LISTA_INFO[l].label}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {envio && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="modal-title">Confirmar Envio</div>
                <div className="modal-sub">Esta ação é irreversível. O comunicado será enviado para todas as listas selecionadas.</div>
              </div>
            </div>
            <div className="modal-body">
              {jaEnviado && (
                <div className="alert alert-warning" style={{ margin: 0 }}>
                  Este sismo já foi comunicado anteriormente ({envio.referencia}). Confirma que deseja enviar o comunicado novamente?
                </div>
              )}
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)', marginBottom: 4 }}>{form.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {envio.referencia} · v{String(envio.versao).padStart(3, '0')}{form.magnitude && ` · Mag ${Number(form.magnitude).toFixed(1)} ML`} · {form.areaName}
                </div>
              </div>
              <div className="grid-2" style={{ gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                {(['emailListas', 'smsListas'] as const).map(tipo => (
                  <div key={tipo} style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>{tipo === 'emailListas' ? 'Email (HTML + PDF)' : 'SMS'}</div>
                    <div className="row" style={{ gap: 6 }}>
                      {form[tipo].length ? form[tipo].map(l => <span key={l} className={LISTA_INFO[l].badge}>{l}</span>) : <span className="delivery-na">Nenhuma</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => router.push(`/comunicados/${envio.comunicadoId}`)} disabled={aEnviar}>Enviar mais tarde</button>
              <button className="btn btn-primary" onClick={confirmarEnvio} disabled={aEnviar}>
                <Svg><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Svg>
                {aEnviar ? 'A enviar…' : 'Enviar Agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function NovoComunicadoPage() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}><NovoComunicado /></Suspense>;
}
