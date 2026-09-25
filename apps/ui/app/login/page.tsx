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
      // Full reload: garante que o RootLayout re-monta e re-lê o novo user do localStorage.
      window.location.href = '/';
    } catch {
      setError('Erro de ligação ao servidor');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '48px 40px', width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,36,.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/ipma-logo.png" alt="IPMA" style={{ height: 72, width: 'auto', marginBottom: 16, display: 'block', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', letterSpacing: -0.3 }}>Comunicados Sismológicos</div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
            {loading ? 'A autenticar...' : 'Entrar'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#9CA3AF' }}>
          <strong>Copyright © Instituto Português do Mar e da Atmosfera 2026</strong>
        </div>
      </div>
    </div>
  );
}
