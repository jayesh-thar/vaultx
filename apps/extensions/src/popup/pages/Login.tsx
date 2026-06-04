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
      setError('Email and password are required');
      return;
    }
    setError('');
    setLoading(true);

    const res = await chrome.runtime.sendMessage<object, LoginResponse>({
      type: MSG.LOGIN,
      payload: { email, password },
    });

    setLoading(false);

    if (res.success) {
      onLoginSuccess();
    } else {
      setError(res.error ?? 'Login failed');
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>🔐</span>
        <h1 style={styles.title}>VaultX</h1>
        <p style={styles.subtitle}>Your zero-knowledge vault</p>
      </div>

      <div style={styles.form}>
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Master Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Unlocking... (~2s)' : 'Unlock Vault'}
        </button>

        <p style={styles.hint}>
          PBKDF2 key derivation takes ~2 seconds — this is intentional security.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: 24,
  },
  header: {
    textAlign: 'center',
  },
  logo: {
    fontSize: 32,
  },
  title: {
    margin: '4px 0 0',
    fontSize: 22,
    fontWeight: 700,
    color: '#10b981',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#6b7280',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #374151',
    background: '#1f2937',
    color: '#f9fafb',
    fontSize: 14,
    outline: 'none',
  },
  button: {
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: '#10b981',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  error: {
    margin: 0,
    fontSize: 12,
    color: '#ef4444',
  },
  hint: {
    margin: 0,
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'center',
  },
};
