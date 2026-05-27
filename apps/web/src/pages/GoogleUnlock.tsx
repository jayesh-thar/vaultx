import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { deriveKeys, toHex } from '../lib/kdf';
import { decryptBytes } from '../lib/crypto';
import { saveSession } from '../lib/storage';
import { useVaultStore } from '../store/useVaultStore';
import api from '../lib/api';

export default function GoogleUnlock() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth, setVaultKey } = useVaultStore();

  const userId = params.get('userId') ?? '';
  const email = params.get('email') ?? '';
  const name = params.get('displayName') ?? '';
  const picture = params.get('picture') ?? '';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUnlock() {
    if (!password) return setError('Enter your vault password');
    setLoading(true);
    setError('');
    try {
      // Get KDF params for this email
      const { data: kdfData } = await api.post('/api/auth/prelogin', { email });

      // Derive keys
      const { authKey, vaultKey: derivedKey } = await deriveKeys(
        password,
        kdfData.kdfSalt,
        kdfData.kdfParams
      );

      // Login
      const { data } = await api.post('/api/auth/login', {
        email,
        authKey: toHex(authKey),
      });

      // Decrypt master key
      const masterKey = await decryptBytes(
        { ciphertext: data.vaultKeyEnc, iv: data.vaultKeyIv },
        derivedKey
      );

      saveSession({
        email,
        userId: data.userId,
        kdfSalt: data.kdfSalt,
        kdfParams: data.kdfParams,
        vaultKeyEnc: data.vaultKeyEnc,
        vaultKeyIv: data.vaultKeyIv,
      });

      setAuth(data.userId, data.accessToken);
      setVaultKey(masterKey as Uint8Array<ArrayBuffer>);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Incorrect vault password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-subtle)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="11"
                width="18"
                height="11"
                rx="2"
                stroke="var(--accent)"
                strokeWidth="2"
              />
              <path
                d="M7 11V7a5 5 0 0110 0v4"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span
            className="font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            VaultX
          </span>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{
            background: 'var(--bg-surface)',
            border: '0.5px solid var(--border)',
          }}
        >
          <div
            className="flex items-center gap-3 mb-5 pb-4"
            style={{ borderBottom: '0.5px solid var(--border)' }}
          >
            {picture ? (
              <img
                src={picture}
                alt={name}
                className="w-12 h-12 rounded-full"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-medium"
                style={{
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p
                className="font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {email}
              </p>
            </div>
          </div>

          <p
            className="text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            Unlock your vault
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Enter your vault password to decrypt your data.
          </p>

          {error && (
            <div
              className="rounded-lg px-3 py-2.5 mb-3 text-sm"
              style={{ background: '#2A0000', color: 'var(--danger)' }}
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              aria-label="Vault password"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none vx-input"
              style={{
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder="Enter your vault password"
              autoFocus
            />

            <button
              onClick={handleUnlock}
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-medium vx-btn-accent"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Unlocking...' : 'Unlock vault'}
            </button>

            <p
              className="text-xs text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              Not you?{' '}
              <a href="/login" style={{ color: 'var(--accent)' }}>
                Use a different account
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
