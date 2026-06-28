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
import { ToastContainer } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import StatsPage from './pages/Stats';
import ForgotPassword from './pages/ForgotPassword';
import Landing from './pages/Landing';
import PrivacyPolicy from './pages/PrivacyPolicy';

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
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/unlock" element={<Unlock />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Settings />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/health"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <HealthDashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stats"
            element={
              <ProtectedRoute>
                <StatsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/share/:id" element={<ShareView />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/google/setup" element={<GoogleSetup />} />{' '}
          <Route path="/auth/google/unlock" element={<GoogleUnlock />} />{' '}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </>
  );
}
