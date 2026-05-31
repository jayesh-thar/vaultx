import { useState } from 'react';
import { sendMessage } from '../../lib/messages';
import type { LoginPayload, VaultItemsResultPayload } from '../../lib/messages';

interface Props {
  onSuccess: (email: string) => void;
}

export default function Login({ onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email || !password) return;
    setError(null);
    setLoading(true);

    try {
      const res = await sendMessage<
        LoginPayload,
        { success: boolean; error?: string }
      >({
        type: 'LOGIN',
        payload: { email, password },
      });

      if (res.success) {
        onSuccess(email);
      } else {
        setError(res.error ?? 'Login failed');
      }
    } catch {
      setError('Could not reach VaultX service worker');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.container}>
      {/* Logo */}
      <div style={s.logoRow}>
        <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#6366f1" />
          <path
            d="M16 8L22 12V18L16 24L10 18V12L16 8Z"
            stroke="white"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="16" cy="16" r="2" fill="white" />
        </svg>
        <span style={s.logoText}>VaultX</span>
      </div>

      <p style={s.heading}>Unlock your vault</p>
      <p style={s.sub}>Enter your master password to continue</p>

      {/* Inputs */}
      <div style={s.form}>
        <div style={s.field}>
          <label style={s.label}>Email</label>
          <input
            style={s.input}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            disabled={loading}
            autoFocus
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
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            disabled={loading}
          />
        </div>

        {error && <p style={s.error}>{error}</p>}

        <button
          style={{ ...s.button, ...(loading ? s.buttonDisabled : {}) }}
          onClick={handleSubmit}
          disabled={loading || !email || !password}
        >
          {loading ? (
            <span style={s.spinnerRow}>
              <Spinner /> Deriving keys…
            </span>
          ) : (
            'Unlock'
          )}
        </button>
      </div>

      <p style={s.hint}>Session clears when browser closes</p>
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid rgba(255,255,255,0.3)',
        borderTop: '2px solid #fff',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        marginRight: 8,
      }}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '28px 24px 20px',
    gap: 8,
    minHeight: 500,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f0f0f0',
    letterSpacing: '-0.5px',
  },
  heading: {
    fontSize: 16,
    fontWeight: 600,
    color: '#f0f0f0',
    margin: 0,
  },
  sub: {
    fontSize: 12,
    color: '#666',
    margin: '0 0 16px',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  label: {
    fontSize: 12,
    color: '#888',
    fontWeight: 500,
  },
  input: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#f0f0f0',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  button: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '11px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
    transition: 'background 0.15s',
  },
  buttonDisabled: {
    background: '#3d3f8f',
    cursor: 'not-allowed',
  },
  spinnerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 12,
    color: '#f87171',
    background: '#2a1515',
    border: '1px solid #3d1f1f',
    borderRadius: 6,
    padding: '8px 10px',
    margin: 0,
  },
  hint: {
    fontSize: 11,
    color: '#444',
    marginTop: 'auto',
    paddingTop: 16,
  },
};
