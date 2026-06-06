import { useState } from 'react';
import { MSG } from '../../lib/messages';
import type { LoginResponse } from '../../lib/messages';

interface Props {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      setError('Both fields required');
      return;
    }
    setError('');
    setLoading(true);
    const res = await chrome.runtime.sendMessage<object, LoginResponse>({
      type: MSG.LOGIN,
      payload: { email, password },
    });
    setLoading(false);
    if (res.success) onLoginSuccess();
    else setError(res.error ?? 'Login failed');
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoRing}>🔐</div>
        <h1 style={s.title}>VaultX</h1>
        <p style={s.sub}>Zero-knowledge password manager</p>
      </div>

      {/* Form */}
      <div style={s.card}>
        <div style={s.field}>
          <label style={s.label}>Email</label>
          <input
            style={s.input}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Master Password</label>
          <input
            style={s.input}
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>

        {error && (
          <div style={s.errorBox}>
            <span>⚠</span> {error}
          </div>
        )}

        <button
          style={{ ...s.btn, opacity: loading ? 0.75 : 1 }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <span>
              Deriving keys<span style={s.dots}>...</span>
            </span>
          ) : (
            'Unlock Vault'
          )}
        </button>

        <p style={s.hint}>PBKDF2 · 600k iterations · Takes ~2s intentionally</p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 24px',
    gap: 24,
    minHeight: 520,
    background: '#0f172a',
  },
  header: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  logoRing: { fontSize: 40 },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: '#10b981',
    letterSpacing: '-0.5px',
  },
  sub: { fontSize: 12, color: '#64748b' },
  card: {
    width: '100%',
    background: '#1e293b',
    borderRadius: 14,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    border: '1px solid #334155',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: 14,
    outline: 'none',
  },
  btn: {
    padding: '12px 0',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  errorBox: {
    padding: '10px 14px',
    borderRadius: 8,
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    fontSize: 13,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  hint: { textAlign: 'center', fontSize: 11, color: '#475569' },
  dots: { display: 'inline-block' },
};
