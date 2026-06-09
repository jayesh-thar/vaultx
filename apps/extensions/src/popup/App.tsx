import { useEffect, useState } from 'react';
import { MSG } from '../lib/messages';
import type { CheckSessionResponse } from '../lib/messages';
import Login from './pages/Login';
import Vault from './pages/Vault';

type View = 'loading' | 'login' | 'vault';

export default function App() {
  const [view, setView] = useState<View>('loading');

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
      setView(res.isLoggedIn ? 'vault' : 'login');
    } catch {
      setView('login');
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

  if (view === 'login') {
    return <Login onLoginSuccess={() => setView('vault')} />;
  }

  return <Vault onLogout={() => setView('login')} />;
}
