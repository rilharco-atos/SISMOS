'use client';
import './globals.css';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const PIN_KEY = 'atos_sidebar_pinned';
const THEME_KEY = 'atos_theme';

function Svg({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <svg viewBox="0 0 24 24" style={style}>{children}</svg>;
}

const NAV: { group: string; adminOnly?: boolean; items: { label: string; href: string; icon: React.ReactNode }[] }[] = [
  { group: 'Operação', items: [
    { label: 'Dashboard', href: '/', icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
    { label: 'Comunicados', href: '/comunicados', icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></> },
    { label: 'Novo Comunicado', href: '/comunicados/novo', icon: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></> },
  ]},
  { group: 'Sistema', adminOnly: true, items: [
    { label: 'Backoffice', href: '/backoffice', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></> },
  ]},
];

function crumbFor(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (pathname === '/comunicados/novo') return 'Novo Comunicado';
  if (pathname.endsWith('/editar')) return 'Editar Comunicado';
  if (pathname.startsWith('/comunicados/')) return 'Detalhe do Comunicado';
  if (pathname.startsWith('/comunicados')) return 'Comunicados';
  if (pathname.startsWith('/backoffice')) return 'Backoffice';
  return '';
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/comunicados') return pathname.startsWith('/comunicados') && pathname !== '/comunicados/novo';
  return pathname.startsWith(href);
}

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* armazenamento indisponível */ } }

function initials(name?: string) {
  if (!name) return '··';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState('');
  const [saude, setSaude] = useState<{ ambiente?: string; modoEnvio?: string; envioSimulado?: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const userBtn = useRef<HTMLButtonElement>(null);

  const isLogin = pathname === '/login';
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (user && !isAdmin && pathname.startsWith('/backoffice')) router.replace('/');
  }, [user, isAdmin, pathname, router]);

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('user') ?? 'null')); } catch { setUser(null); }
    if (safeGet(THEME_KEY) === 'dark') document.documentElement.classList.add('dark');
    const mobile = window.matchMedia('(max-width:768px)').matches;
    const pin = safeGet(PIN_KEY) !== '0' && !mobile;
    setPinned(pin); setOpen(pin);
    document.documentElement.classList.toggle('sidebar-pinned', pin);
  }, []);

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString('pt-PT', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC');
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isLogin) return;
    const ler = () => fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/system/health`)
      .then(r => r.json()).then(setSaude).catch(() => setSaude(null));
    ler();
    const id = setInterval(ler, 60000);
    return () => clearInterval(id);
  }, [isLogin]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  function togglePin() {
    if (window.matchMedia('(max-width:768px)').matches) { setOpen(o => !o); return; }
    const on = !pinned;
    setPinned(on); setOpen(on);
    document.documentElement.classList.toggle('sidebar-pinned', on);
    safeSet(PIN_KEY, on ? '1' : '0');
  }

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark');
    safeSet(THEME_KEY, dark ? 'dark' : 'light');
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/login');
  }

  function go(href: string) {
    router.push(href);
    if (window.matchMedia('(max-width:768px)').matches) setOpen(false);
  }

  if (isLogin) {
    return (
      <html lang="pt">
        <head><title>SISMOS · IPMA</title></head>
        <body>{children}</body>
      </html>
    );
  }

  const menuPos = userBtn.current?.getBoundingClientRect();

  return (
    <html lang="pt">
      <head><title>SISMOS · IPMA</title></head>
      <body>
        <div className="shell">
          <aside
            className={`sidebar${open ? ' open' : ''}`}
            onMouseEnter={() => { if (!window.matchMedia('(max-width:768px)').matches) { clearTimeout(closeTimer.current); setOpen(true); } }}
            onMouseLeave={() => { if (!pinned) closeTimer.current = setTimeout(() => setOpen(false), 180); }}
          >
            <a className="nav-brand" href="/" onClick={e => { e.preventDefault(); go('/'); }}>
              <img className="nav-brand-logo" src="/ipma-logo.png" alt="IPMA" />
              <span className="nav-brand-rule" />
              <span className="nav-brand-copy">
                <span className="nav-brand-name">SISMOS</span>
                <span className="nav-brand-sub">Comunicados Sismológicos IPMA</span>
              </span>
            </a>
            <nav className="nav-scroll">
              {NAV.filter(g => !g.adminOnly || isAdmin).map(g => (
                <div key={g.group}>
                  <div className="nav-group"><span className="nav-group-label">{g.group}</span></div>
                  {g.items.map(item => (
                    <button key={item.href} className={`nav-item${isActive(pathname, item.href) ? ' active' : ''}`} onClick={() => go(item.href)} title={item.label}>
                      <span className="nav-icon"><Svg>{item.icon}</Svg></span>
                      <span className="nav-text">{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="nav-footer">
              <button ref={userBtn} className="nav-user" aria-expanded={menuOpen} onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}>
                <span className="nav-user-avatar">{initials(user?.name)}</span>
                <span className="nav-user-copy">
                  <span className="nav-user-name">{user?.name ?? '—'}</span>
                  <span className="nav-user-email">{user?.email ?? ''}</span>
                </span>
              </button>
            </div>
          </aside>

          <header className="app-topbar">
            <button className="topbar-icon-btn" onClick={togglePin} title="Fixar/ocultar barra lateral" aria-pressed={pinned}>
              <Svg><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></Svg>
            </button>
            <nav className="topbar-crumbs">
              <span>IPMA</span>
              <Svg><polyline points="9 18 15 12 9 6" /></Svg>
              <span aria-current="page">{crumbFor(pathname)}</span>
            </nav>
            <div className="topbar-right">
              <span className="topbar-meta">{now}</span>
              <button className="topbar-icon-btn" onClick={toggleTheme} title="Alternar tema">
                <Svg><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Svg>
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => go('/comunicados/novo')}>
                <Svg style={{ width: 12, height: 12 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>
                Novo Comunicado
              </button>
            </div>
          </header>

          <main className="main">
            {saude?.ambiente === 'test' && (
              <div className="env-banner" role="status">
                {saude.envioSimulado
                  ? <><strong>Demonstração</strong> — envios simulados: nenhum email ou SMS sai da plataforma e nada é publicado no website. Dados fictícios.</>
                  : <><strong>Ambiente de testes</strong> — os emails e SMS são enviados apenas para contactos internos do IPMA e nada é publicado no website.</>}
              </div>
            )}
            {saude?.ambiente !== 'test' && saude?.modoEnvio === 'test' && (
              <div className="env-banner env-banner--suave" role="status">
                <strong>Modo de envio: teste</strong> — só os contactos marcados como internos recebem. Altere em Backoffice › Configurações.
              </div>
            )}
            {children}
          </main>
        </div>

        {menuOpen && menuPos && (
          <div className="menu" style={{ left: Math.round(menuPos.right + 8), bottom: Math.round(window.innerHeight - menuPos.bottom) }} onClick={e => e.stopPropagation()}>
            <div className="menu-head">
              <strong>{user?.name}</strong>
              <span>{user?.role === 'ADMIN' ? 'Administrador' : 'Analista'} · IPMA</span>
            </div>
            <button className="menu-item" onClick={() => { toggleTheme(); setMenuOpen(false); }}>
              <Svg><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Svg>
              Alternar tema
            </button>
            <button className="menu-item menu-item--danger" onClick={logout}>
              <Svg><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Svg>
              Terminar sessão
            </button>
          </div>
        )}
      </body>
    </html>
  );
}
