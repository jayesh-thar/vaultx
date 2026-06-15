import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import api from '../lib/api';
import { deriveKeys, toHex } from '../lib/kdf';
import { decryptBytes } from '../lib/crypto';
import { loadSession, saveSession } from '../lib/storage';
import { useVaultStore } from '../store/useVaultStore';

export default function Unlock() {
  const navigate = useNavigate();
  const { setAuth, setVaultKey } = useVaultStore();
  const session = loadSession();

  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!session) {
    navigate('/login');
    return null;
  }

  async function handleUnlock() {
    setError('');
    if (!password) return setError('Enter your master password.');

    setLoading(true);
    try {
      // Derive vault key from password + stored salt
      const { authKey, vaultKey: derivedKey } = await deriveKeys(
        password,
        session!.kdfSalt,
        session!.kdfParams
      );

      // Decrypt master key from stored encrypted key
      const masterKey = await decryptBytes(
        { ciphertext: session!.vaultKeyEnc, iv: session!.vaultKeyIv },
        derivedKey
      );

      // Fast path — try refreshing the existing session via httpOnly cookie
      try {
        const { data } = await api.post<{ accessToken: string }>(
          '/api/auth/refresh'
        );
        setAuth(session!.userId, data.accessToken);
        setVaultKey(masterKey);
        navigate('/dashboard');
        return;
      } catch {
        // Refresh token expired/missing — fall back to a full silent login
        // using the password just entered. No need to send the user back
        // to the email+password screen.
      }

      const { data: loginData } = await api.post('/api/auth/login', {
        email: session!.email,
        authKey: toHex(authKey),
      });

      setAuth(loginData.userId, loginData.accessToken);
      setVaultKey(masterKey);
      saveSession({
        email: session!.email,
        userId: loginData.userId,
        kdfSalt: session!.kdfSalt,
        kdfParams: session!.kdfParams,
        vaultKeyEnc: loginData.vaultKeyEnc,
        vaultKeyIv: loginData.vaultKeyIv,
      });
      navigate('/dashboard');
    } catch {
      // Either decrypt failed (wrong password) or login 401'd (wrong password)
      setError('Incorrect password. Please try again.');
    } finally {
      setLoading(false);
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
            Vault locked
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {session.email}
          </p>
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 mb-5 text-sm"
            style={{ background: '#2A0000', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
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
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder="Enter your master password"
                disabled={loading}
                autoFocus
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

          <button
            onClick={handleUnlock}
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-medium mt-2"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Unlocking...' : 'Unlock vault'}
          </button>
        </div>

        <p
          className="text-center text-sm mt-6"
          style={{ color: 'var(--text-muted)' }}
        >
          Different account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
