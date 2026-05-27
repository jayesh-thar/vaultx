import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import api from '../lib/api';
import { deriveKeys, toHex } from '../lib/kdf';
import { decryptBytes } from '../lib/crypto';
import { loadKdfLocally, saveSession } from '../lib/storage';
import { useVaultStore } from '../store/useVaultStore';

// Update this interface
interface LoginResponse {
  accessToken: string;
  userId: string;
  vaultKeyEnc: string;
  vaultKeyIv: string;
}

export default function Login() {
  const navigate = useNavigate();
  const { setAuth, setVaultKey } = useVaultStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setMsg] = useState('');

  async function handleLogin() {
    setError('');
    if (!email || !password) return setError('All fields are required.');

    // Retrieve kdf params stored locally at registration
    const kdfData = loadKdfLocally(email);
    if (!kdfData) {
      return setError(
        'No vault found for this email on this device. Please register first.'
      );
    }

    setLoading(true);
    try {
      setMsg('Deriving keys...');
      const { authKey, vaultKey: derivedKey } = await deriveKeys(
        password,
        kdfData.kdfSalt,
        kdfData.kdfParams
      );

      setMsg('Authenticating...');
      const { data } = await api.post<LoginResponse>('/api/auth/login', {
        email,
        authKey: toHex(authKey),
      });

      setMsg('Unlocking vault...');
      // Decrypt the vault master key using the derived key
      const masterKey = await decryptBytes(
        { ciphertext: data.vaultKeyEnc, iv: data.vaultKeyIv },
        derivedKey
      );

      setAuth(data.userId, data.accessToken);
      setVaultKey(masterKey);
      // Save full session to localStorage for unlock-on-reload
      saveSession({
        email,
        userId: data.userId,
        kdfSalt: kdfData.kdfSalt,
        kdfParams: kdfData.kdfParams,
        vaultKeyEnc: data.vaultKeyEnc,
        vaultKeyIv: data.vaultKeyIv,
      });
      navigate('/dashboard');
    } catch (err) {
      const e = err as AxiosError<{ message?: string }>;
      if (e.response?.status === 401) {
        setError('Incorrect password.');
      } else {
        setError(
          e.response?.data?.message ?? 'Login failed. Please try again.'
        );
      }
    } finally {
      setLoading(false);
      setMsg('');
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: 'var(--bg-surface)',
          border: '0.5px solid var(--border)',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl mb-4"
            style={{ background: 'var(--accent-subtle)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="11"
                width="18"
                height="11"
                rx="2"
                stroke="#10B981"
                strokeWidth="2"
              />
              <path
                d="M7 11V7a5 5 0 0110 0v4"
                stroke="#10B981"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1
            className="text-xl font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Unlock your vault
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Enter your master password to continue
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded-lg px-4 py-3 mb-5 text-sm"
            style={{ background: '#2A0000', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {/* Email */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Master Password
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Enter your master password"
                disabled={loading}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none pr-14"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Google Auth */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-px"
              style={{ background: 'var(--border)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              or
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: 'var(--border)' }}
            />
          </div>

          <a
            href="http://localhost:5000/api/auth/google"
            className="w-full flex items-center justify-center gap-3 rounded-lg py-2.5 text-sm font-medium vx-btn-ghost"
            style={{
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </a>

          {/* Submit */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-medium mt-2"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? loadingMsg : 'Unlock vault'}
          </button>
        </div>

        <p
          className="text-center text-sm mt-6"
          style={{ color: 'var(--text-muted)' }}
        >
          No vault yet?{' '}
          <Link to="/register" style={{ color: 'var(--accent)' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
