import { useState } from 'react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../store.jsx';
import SearchBar from './SearchBar.jsx';
import {
  Modal,
  IconPin,
  IconBell,
  IconHeart,
  IconSun,
  IconMoon,
  IconChart,
  IconSearch,
} from './ui.jsx';

function Logo() {
  return (
    <NavLink to="/" className="logo" aria-label="Business Finder home">
      <span className="logo__mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>
      </span>
      <span>Business Finder</span>
    </NavLink>
  );
}

/** Sign in / create account. Demo credentials are shown so the app is walk-up usable. */
function AuthModal() {
  const { setAuthOpen, signIn } = useApp();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(
        mode === 'register' ? form : { email: form.email, password: form.password },
        mode,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const useDemo = (email) => setForm((f) => ({ ...f, email, password: 'demo1234' }));

  return (
    <Modal onClose={() => setAuthOpen(false)} labelledBy="auth-title">
      <div className="stack" style={{ gap: 20 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h2 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="small muted">
            {mode === 'login'
              ? 'Sign in to save favourites and get told when they post.'
              : 'Customers save places they love. Business accounts can post updates.'}
          </p>
        </div>

        <div className="tabs">
          <button className={mode === 'login' ? 'is-on' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>

        <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="auth-name">Name</label>
              <input id="auth-name" className="input" value={form.name} onChange={set('name')} required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              className="input"
              value={form.email}
              onChange={set('email')}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="input"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="auth-role">Account type</label>
              <select id="auth-role" className="select" value={form.role} onChange={set('role')}>
                <option value="customer">I'm looking for places</option>
                <option value="owner">I run a business</option>
              </select>
            </div>
          )}

          {error && <div className="alert">{error}</div>}

          <button className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="stack" style={{ gap: 8 }}>
          <span className="tiny muted">Demo accounts — password <code>demo1234</code></span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--ghost btn--sm grow" onClick={() => useDemo('customer@demo.test')}>
              Customer
            </button>
            <button className="btn btn--ghost btn--sm grow" onClick={() => useDemo('owner@demo.test')}>
              Business owner
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Shell({ children }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, meta, theme, toggleTheme, authOpen, setAuthOpen, signOut, unreadCount, toasts, hasRealLocation } =
    useApp();

  const search = (q) => navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');

  return (
    <>
      <header className="topbar">
        <Logo />
        <SearchBar value={params.get('q') ?? ''} onSearch={search} />

        <nav className="nav" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Discover
          </NavLink>
          <NavLink to="/feed" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Happening
            {unreadCount > 0 && <span className="nav__badge">{unreadCount}</span>}
          </NavLink>
          <NavLink to="/saved" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Saved
          </NavLink>
          {user?.role === 'owner' && (
            <NavLink to="/business" className={({ isActive }) => (isActive ? 'is-active' : '')}>
              My business
            </NavLink>
          )}
        </nav>

        <div className="row" style={{ gap: 8, flex: 'none' }}>
          <span className="tiny muted row" style={{ gap: 4 }} title={hasRealLocation ? 'Using your location' : 'Using the demo city centre'}>
            <IconPin size={13} />
            <span className="truncate" style={{ maxWidth: 90 }}>
              {hasRealLocation ? 'Your area' : meta?.city ?? '—'}
            </span>
          </span>

          <button
            className="btn btn--icon btn--ghost"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
          </button>

          {user ? (
            <button className="btn btn--ghost btn--sm" onClick={signOut} title={user.email}>
              {user.name.split(' ')[0]} · Sign out
            </button>
          ) : (
            <button className="btn btn--primary btn--sm" onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main>{children}</main>

      {/* Mobile navigation */}
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconSearch size={19} />
          Discover
        </NavLink>
        <NavLink to="/feed" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconBell size={19} />
          Happening
        </NavLink>
        <NavLink to="/saved" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconHeart size={19} />
          Saved
        </NavLink>
        <NavLink to={user?.role === 'owner' ? '/business' : '/feed'} className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconChart size={19} />
          {user?.role === 'owner' ? 'Business' : 'For you'}
        </NavLink>
      </nav>

      {authOpen && <AuthModal />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
