'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { comunicadosApi } from '../../../lib/api';

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export default function EditarComunicadoPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [novaVersao, setNovaVersao] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ titulo: '', texto: '', imagemUrl: '', websiteInicio: '', websiteFim: '' });

  useEffect(() => {
    comunicadosApi.get(id).then(d => {
      setForm({
        titulo: d.titulo ?? '',
        texto: d.texto ?? '',
        imagemUrl: d.imagemUrl ?? '',
        websiteInicio: d.websiteInicio ? new Date(d.websiteInicio).toISOString().substring(0, 16) : '',
        websiteFim: d.websiteFim ? new Date(d.websiteFim).toISOString().substring(0, 16) : '',
      });
      setLoading(false);
    }).catch(() => router.push('/'));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (novaVersao) {
        await comunicadosApi.novaVersao(id, { titulo: form.titulo, texto: form.texto, imagemUrl: form.imagemUrl || undefined });
        setSuccess('Nova versão criada com sucesso');
      } else {
        const utc = (v: string) => (v ? `${v}:00Z` : undefined);
        await comunicadosApi.update(id, {
          titulo: form.titulo, texto: form.texto, imagemUrl: form.imagemUrl || undefined,
          websiteInicio: utc(form.websiteInicio), websiteFim: utc(form.websiteFim),
        });
        setSuccess('Comunicado atualizado com sucesso');
      }
      setTimeout(() => router.push(`/comunicados/${id}`), 1200);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  if (loading) return <div className="page-content"><div className="skeleton" style={{ height: 300 }} /></div>;

  return (
    <>
      <div className="topbar">
        <button className="btn-icon" onClick={() => router.back()}><Icon d="M15 19l-7-7 7-7" /></button>
        <span className="topbar-title">Editar Comunicado</span>
      </div>
      <div className="page-content">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="card">
            <div className="form-group"><label className="form-label">Título</label><input className="form-control" required value={form.titulo} onChange={e => set('titulo', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Texto</label><textarea className="form-control" rows={8} value={form.texto} onChange={e => set('texto', e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Início Website</label><input type="datetime-local" className="form-control" value={form.websiteInicio} onChange={e => set('websiteInicio', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Fim Website</label><input type="datetime-local" className="form-control" value={form.websiteFim} onChange={e => set('websiteFim', e.target.value)} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 8 }}>
              <input type="checkbox" checked={novaVersao} onChange={e => setNovaVersao(e.target.checked)} />
              Criar nova versão (v+1) em vez de editar a versão atual
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'A guardar…' : novaVersao ? 'Criar Nova Versão' : 'Guardar Alterações'}</button>
          </div>
        </form>
      </div>
    </>
  );
}
