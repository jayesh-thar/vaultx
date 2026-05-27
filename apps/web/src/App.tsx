import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useVaultStore } from './store/useVaultStore';
import { loadSession } from './lib/storage';
import Login from './pages/Login';
import Register from './pages/Register';
import Unlock from './pages/Unlock';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import { useEffect } from 'react';
import HealthDashboard from './pages/HealthDashboard';
import ShareView from './pages/ShareView';
import GoogleSetup from './pages/GoogleSetup';
import GoogleUnlock from './pages/GoogleUnlock';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { userId, vaultKey } = useVaultStore();

  if (!userId || !vaultKey) {
    // Has stored session → unlock screen (password only)
    // No session → full login
    const session = loadSession();
    return session ? (
      <Navigate to="/unlock" replace />
    ) : (
      <Navigate to="/login" replace />
    );
  }

  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    const saved = localStorage.getItem('vx_theme') ?? 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/unlock" element={<Unlock />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/health"
          element={
            <ProtectedRoute>
              <HealthDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/share/:id" element={<ShareView />} />
        <Route path="/auth/google/setup" element={<GoogleSetup />} />{' '}
        {/* ADD - next section */}
        <Route path="/auth/google/unlock" element={<GoogleUnlock />} />{' '}
        {/* ADD - next section */}
        <Route path="*" element={<Navigate to="/login" replace />} />{' '}
        {/* ALWAYS LAST */}
      </Routes>
    </BrowserRouter>
  );
}
