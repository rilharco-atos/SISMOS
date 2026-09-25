'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) { setError('Credenciais inválidas'); setLoading(false); return; }
      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user ?? { email, role: 'ANALISTA' }));
      window.location.href = '/';
    } catch {
      setError('Erro de ligação ao servidor');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{`
        @media (max-width: 768px) { .login-left { display: none !important; } .login-right { width: 100% !important; } }
      `}</style>

      {/* Painel esquerdo — identidade */}
      <div className="login-left" style={{
        flex: 1,
        background: 'linear-gradient(160deg, #071330 0%, #0d2158 45%, #071330 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 30% 40%, rgba(56,120,255,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 75% 70%, rgba(99,102,241,0.12) 0%, transparent 60%)',
        }} />
        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 420 }}>
          <img src="/ipma-logo-white.png" alt="IPMA" style={{ height: 72, width: 'auto', marginBottom: 28 }} />
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: -0.5, marginBottom: 8 }}>
            Comunicados Sismológicos
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 36 }}>
            Plataforma Operacional IPMA
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            border: '1px solid rgba(255,255,255,0.18)', borderRadius: 20,
            padding: '6px 18px', fontSize: 11, fontWeight: 600,
            letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            IPMA · Sismologia Operacional · 24/7
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, textTransform: 'uppercase' }}>
          Powered by Atos
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="login-right" style={{
        width: 420, flexShrink: 0,
        background: '#fff',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: '56px 44px',
      }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0a1628', marginBottom: 6, letterSpacing: -0.3 }}>Iniciar Sessão</div>
          <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>Introduza as suas credenciais para aceder à plataforma</div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#374151' }}>Email</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#374151' }}>Palavra-passe</label>
            <input className="form-control" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 42 }} />
            <button type="button" onClick={() => setShowPw(v => !v)} title={showPw ? 'Ocultar' : 'Mostrar'} style={{ position: 'absolute', right: 12, bottom: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2, lineHeight: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                {showPw
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
              </svg>
            </button>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '13px', marginTop: 12, fontSize: 14, fontWeight: 700 }}>
            {loading ? 'A autenticar...' : 'Iniciar Sessão'}
          </button>
        </form>

        <div style={{ marginTop: 'auto', paddingTop: 56, fontSize: 11, color: '#9CA3AF' }}>
          © 2026 — Instituto Português do Mar e da Atmosfera
        </div>
      </div>
    </div>
  );
}
