import { useEffect, useState } from 'react';
import { sendMessage } from '../lib/messages';
import Login from './pages/Login';

// ─── Add keyframe CSS for spinner (can't use @keyframes in inline styles) ─────
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  input:focus { border-color: #6366f1 !important; }
`;
document.head.appendChild(globalStyle);

// ─── App Shell ────────────────────────────────────────────────────────────────

type AppState = 'loading' | 'logged_out' | 'logged_in';

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await sendMessage<
        undefined,
        { isLoggedIn: boolean; email?: string }
      >({
        type: 'CHECK_SESSION',
      });
      setEmail(res.email ?? null);
      setState(res.isLoggedIn ? 'logged_in' : 'logged_out');
    } catch {
      setState('logged_out');
    }
  }

  function handleLoginSuccess(loggedInEmail: string) {
    setEmail(loggedInEmail);
    setState('logged_in');
  }

  async function handleLogout() {
    await sendMessage({ type: 'LOGOUT' });
    setEmail(null);
    setState('logged_out');
  }

  // ── Loading ──
  if (state === 'loading') {
    return (
      <div style={centered}>
        <span style={spinner} />
      </div>
    );
  }

  // ── Not logged in ──
  if (state === 'logged_out') {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  // ── Logged in (Vault page goes here in Step 4) ──
  return (
    <div style={centered}>
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
      <p style={{ color: '#f0f0f0', fontWeight: 600, margin: '8px 0 4px' }}>
        Vault unlocked
      </p>
      <p style={{ color: '#666', fontSize: 12 }}>{email}</p>
      <p style={placeholder}>[ Vault list — Step 4 ]</p>
      <button onClick={handleLogout} style={logoutBtn}>
        Lock vault
      </button>
    </div>
  );
}

const centered: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 500,
  gap: 8,
  padding: 24,
};
const spinner: React.CSSProperties = {
  display: 'inline-block',
  width: 24,
  height: 24,
  border: '2px solid #222',
  borderTop: '2px solid #6366f1',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};
const placeholder: React.CSSProperties = {
  fontSize: 12,
  color: '#444',
  border: '1px dashed #2a2a2a',
  padding: '12px 20px',
  borderRadius: 8,
  marginTop: 12,
};
const logoutBtn: React.CSSProperties = {
  marginTop: 12,
  padding: '8px 20px',
  background: 'transparent',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  color: '#888',
  fontSize: 12,
  cursor: 'pointer',
};
