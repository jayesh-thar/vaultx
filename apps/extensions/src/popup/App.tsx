import { useEffect, useState } from 'react';
import { MSG } from '../lib/messages';
import type { CheckSessionResponse } from '../lib/messages';
import Login from './pages/Login';
import Vault from './pages/Vault';

type View = 'loading' | 'login' | 'vault';

export default function App() {
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    // On every popup open: ask SW if session exists
    chrome.runtime
      .sendMessage<object, CheckSessionResponse>({ type: MSG.CHECK_SESSION })
      .then((res) => {
        setView(res.isLoggedIn ? 'vault' : 'login');
      });
  }, []);

  if (view === 'loading') {
    return (
      <div style={centerStyle}>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (view === 'login') {
    return <Login onLoginSuccess={() => setView('vault')} />;
  }

  return <Vault onLogout={() => setView('login')} />;
}

const centerStyle: React.CSSProperties = {
  width: 360,
  height: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
