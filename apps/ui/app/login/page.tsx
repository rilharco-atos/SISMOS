'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

/*********************************************************************************************************************
* @method       LoginPage
* @description  Authentication page for the IPMA Comunicados Sismológicos platform. Renders a
*               split-panel layout — brand identity on the left, credential form on the right —
*               posts to /auth/login, stores the JWT and user profile in localStorage on success,
*               and performs a hard redirect to the root dashboard.
* @return       JSX element — the full-viewport login page
* @uses         useRouter
*********************************************************************************************************************/
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

      {/* Painel esquerdo — identidade visual IPMA */}
      <div className="login-left" style={{
        flex: 1, background: '#071B4C',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Arcos concêntricos — motivo visual da identidade IPMA */}
        <svg style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none' }}
          width="420" height="420" viewBox="0 0 420 420" fill="none">
          {/* Arco exterior — Mar (#2C3987) */}
          <path d="M 420 60 A 360 360 0 0 0 60 420" stroke="#2C3987" strokeWidth="30" strokeLinecap="round" opacity="0.9"/>
          {/* Azul dos Ventos (#0081E2) */}
          <path d="M 420 120 A 300 300 0 0 0 120 420" stroke="#0081E2" strokeWidth="22" strokeLinecap="round" opacity="0.7"/>
          {/* Atmosfera (#23C3F3) */}
          <path d="M 420 190 A 230 230 0 0 0 190 420" stroke="#23C3F3" strokeWidth="16" strokeLinecap="round" opacity="0.6"/>
          {/* Terra âmbar (#FCAF26) */}
          <path d="M 420 265 A 155 155 0 0 0 265 420" stroke="#FCAF26" strokeWidth="12" strokeLinecap="round" opacity="0.65"/>
          {/* Atmosfera interior */}
          <path d="M 420 335 A 85 85 0 0 0 335 420" stroke="#23C3F3" strokeWidth="8" strokeLinecap="round" opacity="0.45"/>
        </svg>

        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 400 }}>
          <img src="/ipma-logo-white.png" alt="IPMA" style={{ height: 68, width: 'auto', marginBottom: 32 }} />
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: -0.5, lineHeight: 1.2, marginBottom: 10 }}>
            Comunicados<br />Sismológicos
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#FCAF26', marginBottom: 40 }}>
            Plataforma Operacional
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            border: '1px solid rgba(35,195,243,0.30)', borderRadius: 24,
            padding: '8px 20px', fontSize: 11, fontWeight: 600,
            letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.60)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#23C3F3', flexShrink: 0, boxShadow: '0 0 6px rgba(35,195,243,0.8)' }} />
            Sismologia Operacional · 24/7
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.22)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Instituto Português do Mar e da Atmosfera · Atos
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="login-right" style={{
        width: 440, flexShrink: 0,
        background: '#fff',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: '56px 48px',
        borderLeft: '3px solid #FCAF26',
      }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: '#FCAF26', marginBottom: 10 }}>
            IPMA · Sismologia
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#071B4C', marginBottom: 6, lineHeight: 1.2 }}>Iniciar Sessão</div>
          <div style={{ fontSize: 13, color: '#5B6BAD', lineHeight: 1.5 }}>Introduza as suas credenciais para aceder à plataforma</div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#2C3987' }}>Email</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#2C3987' }}>Palavra-passe</label>
            <input className="form-control" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 42 }} />
            <button type="button" onClick={() => setShowPw(v => !v)} title={showPw ? 'Ocultar' : 'Mostrar'} style={{ position: 'absolute', right: 12, bottom: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#8E9BCE', padding: 2, lineHeight: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                {showPw
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
              </svg>
            </button>
          </div>
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px 20px', marginTop: 12,
            background: loading ? '#ccc' : '#FCAF26',
            color: '#071B4C', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing: 0.3, fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 4px 14px rgba(252,175,38,0.35)',
            transition: 'background .15s, box-shadow .15s',
          }}>
            {loading ? 'A autenticar...' : 'Iniciar Sessão'}
          </button>
        </form>

        <div style={{ marginTop: 'auto', paddingTop: 56, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 2, background: '#FCAF26', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#8E9BCE' }}>
            © 2026 Instituto Português do Mar e da Atmosfera
          </span>
        </div>
      </div>
    </div>
  );
}
