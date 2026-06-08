import { useState } from 'react';
import { MSG } from '../../lib/messages';
import type {
  LoginResponse,
  GoogleAuthResponse,
  GoogleUnlockResponse,
} from '../../lib/messages';

interface Props {
  onLoginSuccess: () => void;
}

type View = 'main' | 'google_unlock' | 'google_register';

export default function Login({ onLoginSuccess }: Props) {
  const [view, setView] = useState<View>('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Email login ──────────────────────────────────────────────────────────
  async function handleLogin() {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || !password) {
      setError('Both fields required');
      return;
    }
    setError('');
    setLoading(true);
    const res = await chrome.runtime.sendMessage<object, LoginResponse>({
      type: MSG.LOGIN,
      payload: { email: normalizedEmail, password },
    });
    setLoading(false);
    if (res.success) onLoginSuccess();
    else
      setError(
        res.error?.includes('Invalid')
          ? 'Wrong email or password. New user? Create account below.'
          : (res.error ?? 'Login failed')
      );
  }

  // ── Google login ─────────────────────────────────────────────────────────
  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');
    const res = await chrome.runtime.sendMessage<object, GoogleAuthResponse>({
      type: MSG.GOOGLE_AUTH,
    });
    setGoogleLoading(false);

    if (!res.success) {
      setError(res.error ?? 'Google login failed');
      return;
    }

    setGoogleEmail(res.email ?? '');

    if (res.isNewUser) {
      // New Google user — collect master password to set up vault
      setView('google_register');
    } else if (res.needsMasterPassword) {
      // Existing user — needs master password to decrypt vault
      setView('google_unlock');
    }
  }

  // ── Google unlock (existing user) ────────────────────────────────────────
  async function handleGoogleUnlock() {
    if (!password) {
      setError('Enter your master password');
      return;
    }
    setError('');
    setLoading(true);
    const res = await chrome.runtime.sendMessage<object, GoogleUnlockResponse>({
      type: MSG.GOOGLE_UNLOCK,
      payload: { password },
    });
    setLoading(false);
    if (res.success) onLoginSuccess();
    else setError(res.error ?? 'Incorrect master password');
  }

  // ── Google register (new user) ───────────────────────────────────────────
  async function handleGoogleRegister() {
    if (!regPassword) {
      setError('Set a master password');
      return;
    }
    if (regPassword.length < 12) {
      setError('Master password must be at least 12 characters');
      return;
    }
    if (regPassword !== regConfirm) {
      setError("Passwords don't match");
      return;
    }
    setError('');
    setLoading(true);

    // Send to backend — create account with Google email + master password
    const res = await chrome.runtime.sendMessage<object, LoginResponse>({
      type: MSG.LOGIN,
      payload: {
        email: googleEmail,
        password: regPassword,
        isGoogleSetup: true,
      } as any,
    });
    setLoading(false);

    // Actually we need a REGISTER message here — use the web app for this
    // Redirect to web for full setup (Google new user registration is complex)
    chrome.tabs.create({
      url: `http://localhost:5173/google-setup?email=${encodeURIComponent(googleEmail)}`,
    });
    setError(
      'Complete your account setup in the browser tab that just opened, then come back here.'
    );
    setView('main');
  }

  // ── Google unlock screen ─────────────────────────────────────────────────
  if (view === 'google_unlock') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <div style={{ fontSize: 32 }}>🔐</div>
          <h1 style={s.title}>VaultX</h1>
        </div>
        <div style={s.card}>
          <div style={s.googleUserRow}>
            <div style={s.googleAvatar}>
              {googleEmail.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#f1f5f9',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {googleEmail.split('@')[0]}
              </p>
              <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
                {googleEmail}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
            Enter your master password to decrypt your vault.
          </p>
          <div style={s.field}>
            <label style={s.label}>Master Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGoogleUnlock()}
              autoFocus
            />
          </div>
          {error && <div style={s.errorBox}>⚠ {error}</div>}
          <button
            style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
            onClick={handleGoogleUnlock}
            disabled={loading}
          >
            {loading ? 'Unlocking...' : 'Unlock Vault'}
          </button>
          <button
            style={s.backBtn}
            onClick={() => {
              setView('main');
              setPassword('');
              setError('');
            }}
          >
            ← Use different account
          </button>
        </div>
      </div>
    );
  }

  // ── Google register screen (new user) ────────────────────────────────────
  if (view === 'google_register') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <div style={{ fontSize: 32 }}>🔐</div>
          <h1 style={s.title}>VaultX</h1>
          <p style={s.sub}>Set up your vault</p>
        </div>
        <div style={s.card}>
          <div style={s.googleUserRow}>
            <div style={s.googleAvatar}>
              {googleEmail.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#f1f5f9',
                  margin: 0,
                }}
              >
                {googleEmail}
              </p>
              <p style={{ fontSize: 11, color: '#10b981', margin: '2px 0 0' }}>
                ✓ Google verified
              </p>
            </div>
          </div>
          <p
            style={{
              fontSize: 12,
              color: '#64748b',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            New account detected. To finish setup, complete registration on the
            web app.
          </p>
          {error && <div style={s.errorBox}>⚠ {error}</div>}
          <button
            style={s.btn}
            onClick={handleGoogleRegister}
            disabled={loading}
          >
            {loading ? 'Opening...' : 'Complete Setup in Browser →'}
          </button>
          <button
            style={s.backBtn}
            onClick={() => {
              setView('main');
              setError('');
            }}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Main login screen ────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={{ fontSize: 32 }}>🔐</div>
        <h1 style={s.title}>VaultX</h1>
        <p style={s.sub}>Zero-knowledge password manager</p>
      </div>
      <div style={s.card}>
        <button
          style={{ ...s.googleBtn, opacity: googleLoading ? 0.7 : 1 }}
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          {googleLoading ? (
            'Connecting...'
          ) : (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                style={{ flexShrink: 0 }}
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div style={s.divider}>
          <div style={s.divLine} />
          <span style={s.divText}>or</span>
          <div style={s.divLine} />
        </div>

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
        {error && <div style={s.errorBox}>⚠ {error}</div>}
        <button
          style={{ ...s.btn, opacity: loading ? 0.75 : 1 }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Unlocking... (~2s)' : 'Unlock Vault'}
        </button>
        <div style={s.divider}>
          <div style={s.divLine} />
          <span style={s.divText}>new here?</span>
          <div style={s.divLine} />
        </div>
        <button
          style={s.registerBtn}
          onClick={() =>
            chrome.tabs.create({ url: 'http://localhost:5173/register' })
          }
        >
          Create account →
        </button>
        <p style={s.hint}>PBKDF2 · 600k iterations · ~2s intentionally</p>
      </div>
    </div>
  );
}

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
  googleBtn: {
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  registerBtn: {
    padding: '9px 0',
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
  },
  divider: { display: 'flex', alignItems: 'center', gap: 8 },
  divLine: { flex: 1, height: 1, background: '#334155' },
  divText: { fontSize: 10, color: '#475569' },
  errorBox: {
    padding: '8px 10px',
    borderRadius: 7,
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    fontSize: 12,
  },
  hint: { textAlign: 'center', fontSize: 10, color: '#334155' },
  googleUserRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    background: '#0f172a',
    borderRadius: 7,
    border: '1px solid #334155',
  },
  googleAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#10b98122',
    border: '2px solid #10b981',
    color: '#10b981',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
