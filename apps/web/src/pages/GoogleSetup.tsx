import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  deriveKeys,
  generateSalt,
  toHex,
  DEFAULT_KDF_PARAMS,
} from '../lib/kdf';
import { encryptBytes } from '../lib/crypto';
import { saveSession } from '../lib/storage';
import { useVaultStore } from '../store/useVaultStore';
import api from '../lib/api';

function getStrength(p: string) {
  if (p.length < 8) return { label: 'Too short', color: '#EF4444', bars: 0 };
  let s = 0;
  if (/[A-Z]/.test(p)) s++;
  if (/[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length < 12) return { label: 'Fair', color: '#F59E0B', bars: 2 };
  if (s <= 2) return { label: 'Good', color: '#10B981', bars: 3 };
  return { label: 'Strong', color: '#10B981', bars: 4 };
}

export default function GoogleSetup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth, setVaultKey } = useVaultStore();

  const userId = params.get('userId') ?? '';
  const email = params.get('email') ?? '';
  const name = params.get('displayName') ?? '';
  const picture = params.get('picture') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = password ? getStrength(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function handleSetup() {
    if (!password) return setError('Please create a vault password.');
    if (password.length < 12)
      return setError('Minimum 12 characters required.');
    if (password !== confirm) return setError('Passwords do not match.');

    setLoading(true);
    setError('');
    try {
      const kdfSalt = await generateSalt();
      const authSalt = await generateSalt();
      const masterKey = crypto.getRandomValues(
        new Uint8Array(32)
      ) as Uint8Array<ArrayBuffer>;

      const { authKey, vaultKey: derivedKey } = await deriveKeys(
        password,
        kdfSalt,
        DEFAULT_KDF_PARAMS
      );
      const { ciphertext: vaultKeyEnc, iv: vaultKeyIv } = await encryptBytes(
        masterKey,
        derivedKey
      );

      const { data } = await api.post('/api/auth/google/complete', {
        userId,
        authKey: toHex(authKey),
        authSalt,
        kdfSalt,
        kdfParams: DEFAULT_KDF_PARAMS,
        vaultKeyEnc,
        vaultKeyIv,
      });

      saveSession({
        email,
        userId: data.userId,
        kdfSalt,
        kdfParams: DEFAULT_KDF_PARAMS,
        vaultKeyEnc,
        vaultKeyIv,
      });
      setAuth(data.userId, data.accessToken);
      setVaultKey(masterKey);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Setup failed. Please try again.');
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
        {/* Logo */}
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
          {/* Google profile preview */}
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
                Welcome, {name}!
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
            Create a vault password
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            This encrypts your vault locally. It's completely separate from your
            Google account and we never store it.
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
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Vault password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Vault password"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Minimum 12 characters"
              />
              {strength && password && (
                <div className="mt-1.5">
                  <div className="flex gap-1 mb-0.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full"
                        style={{
                          background:
                            i <= strength.bars
                              ? strength.color
                              : 'var(--border)',
                          transition: 'background 0.2s',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-label="Confirm vault password"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border: mismatch
                    ? '0.5px solid var(--danger)'
                    : '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              {mismatch && (
                <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              onClick={handleSetup}
              disabled={loading || mismatch}
              className="w-full rounded-lg py-2.5 text-sm font-medium vx-btn-accent"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                opacity: loading || mismatch ? 0.7 : 1,
              }}
            >
              {loading ? 'Setting up vault...' : 'Create vault & continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
