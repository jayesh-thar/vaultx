import { useEffect, useState } from 'react';
import { MSG } from '../lib/messages';
import type { CheckSessionResponse } from '../lib/messages';
import Login from './pages/Login';
import Vault from './pages/Vault';

type View = 'loading' | 'login' | 'vault' | 'reunlock';

const s: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: '20px 18px',
    gap: 16,
    minHeight: 520,
    background: '#0f172a',
  },
  header: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  title: { fontSize: 22, fontWeight: 800, color: '#10b981', margin: 0 },
  sub: { fontSize: 11, color: '#64748b', margin: 0 },
  card: {
    background: '#1e293b',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    border: '1px solid #334155',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '9px 11px',
    borderRadius: 7,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: 13,
    outline: 'none',
  },
  btn: {
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg,#10b981,#059669)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  errorBox: {
    padding: '8px 10px',
    borderRadius: 7,
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    fontSize: 12,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'center',
  },
};

export default function App() {
  const [view, setView] = useState<View>('loading');
  const [savedEmail, setSavedEmail] = useState('');
  const [reunlockPassword, setReunlockPassword] = useState('');
  const [reunlockError, setReunlockError] = useState('');
  const [reunlockLoading, setReunlockLoading] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await chrome.runtime.sendMessage<
        object,
        CheckSessionResponse
      >({
        type: MSG.CHECK_SESSION,
      });
      if (res.needsUnlock) {
        setSavedEmail(res.email ?? '');
        setView('reunlock');
      } else {
        setView(res.isLoggedIn ? 'vault' : 'login');
      }
    } catch {
      setView('login');
    }
  }

  async function handleReunlock() {
    if (!reunlockPassword) {
      setReunlockError('Enter your master password');
      return;
    }
    setReunlockLoading(true);
    setReunlockError('');
    const res = await chrome.runtime.sendMessage({
      type: 'REUNLOCK',
      payload: { password: reunlockPassword },
    });
    setReunlockLoading(false);
    if ((res as any).success) {
      setView('vault');
    } else {
      setReunlockError((res as any).error ?? 'Incorrect password');
    }
  }

  if (view === 'loading') {
    return (
      <div
        style={{
          width: 400,
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔐</div>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Loading VaultX...
          </p>
        </div>
      </div>
    );
  }

  if (view === 'reunlock') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <div style={{ fontSize: 32 }}>🔐</div>
          <h1 style={s.title}>VaultX</h1>
          <p style={s.sub}>Welcome back</p>
        </div>
        <div style={s.card}>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Signed in as{' '}
            <strong style={{ color: '#f1f5f9' }}>{savedEmail}</strong>
          </p>
          <div style={s.field}>
            <label style={s.label}>Master Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="••••••••••••"
              value={reunlockPassword}
              onChange={(e) => setReunlockPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReunlock()}
              autoFocus
            />
          </div>
          {reunlockError && <div style={s.errorBox}>⚠ {reunlockError}</div>}
          <button
            style={{ ...s.btn, opacity: reunlockLoading ? 0.7 : 1 }}
            onClick={handleReunlock}
            disabled={reunlockLoading}
          >
            {reunlockLoading ? 'Unlocking...' : 'Unlock'}
          </button>
          <button
            style={s.backBtn}
            onClick={async () => {
              await chrome.runtime.sendMessage({ type: MSG.LOGOUT });
              setReunlockPassword('');
              setReunlockError('');
              setView('login');
            }}
          >
            Not you? Sign out
          </button>
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return <Login onLoginSuccess={() => setView('vault')} />;
  }

  return <Vault onLogout={() => setView('login')} />;
}
