import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import api from '../lib/api';
import { loadSession } from '../lib/storage';
import {
  deriveKeys,
  generateSalt,
  toHex,
  DEFAULT_KDF_PARAMS,
} from '../lib/kdf';
import { decryptBytes, encryptBytes, encrypt } from '../lib/crypto';
import { parseCSV, type ParsedItem } from '../lib/csvImport';
import { useVaultStore } from '../store/useVaultStore';
import { toast } from '../lib/toast';
import { clearStoredSession } from '../lib/storage';

type Tab = 'profile' | 'security' | 'appearance' | 'data';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getPasswordStrength(p: string) {
  if (p.length < 8) return { label: 'Weak', color: '#EF4444', bars: 1 };

  let score = 0;
  if (/[A-Z]/.test(p)) score++;
  if (/[a-z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;

  // Under 12 chars — always max Fair regardless of complexity
  if (p.length < 12) {
    return score >= 3
      ? { label: 'Fair', color: '#F59E0B', bars: 2 }
      : { label: 'Weak', color: '#EF4444', bars: 1 };
  }

  if (score <= 1) return { label: 'Fair', color: '#F59E0B', bars: 2 };
  if (score <= 2) return { label: 'Good', color: '#10B981', bars: 3 };
  return { label: 'Strong', color: '#10B981', bars: 4 };
}

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl p-5 flex flex-col gap-4 ${className}`}
      style={{
        background: 'var(--bg-surface)',
        border: '0.5px solid var(--border)',
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-medium"
      style={{
        color: 'var(--text-muted)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${!active ? 'vx-nav-item' : ''}`}
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();
  const session = loadSession();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [theme, setTheme] = useState(
    () => localStorage.getItem('vx_theme') ?? 'dark'
  );
  const [stats, setStats] = useState({
    total: 0,
    logins: 0,
    notes: 0,
    cards: 0,
  });

  useEffect(() => {
    api
      .get('/api/vault/items')
      .then(({ data }) => {
        const items: Array<{ type: string }> = Array.isArray(data)
          ? data
          : (data.items ?? []);
        setStats({
          total: items.length,
          logins: items.filter((i) => i.type === 'login').length,
          notes: items.filter((i) => i.type === 'note').length,
          cards: items.filter((i) => i.type === 'card').length,
        });
      })
      .catch(() => {});
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: 'security',
      label: 'Security',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="11"
            width="18"
            height="11"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M7 11V7a5 5 0 0110 0v4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2" />
        </svg>
      ),
    },
    {
      id: 'data',
      label: 'Data',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <ellipse
            cx="12"
            cy="5"
            rx="9"
            ry="3"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Header */}
      <header
        className="flex items-center gap-4 px-6 py-4 sticky top-0 z-10"
        style={{
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          aria-label="Back"
          className="flex items-center gap-2 text-sm vx-btn"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M19 12H5M5 12l7-7M5 12l7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          Settings
        </span>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 flex gap-8">
        {/* Tab nav */}
        <nav
          className="flex flex-col gap-1"
          style={{ width: 160, flexShrink: 0 }}
        >
          {tabs.map((t) => (
            <TabButton
              key={t.id}
              {...t}
              active={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
            />
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <ProfileTab session={session} stats={stats} />
          )}
          {activeTab === 'security' && <SecurityTab session={session} />}
          {activeTab === 'appearance' && (
            <AppearanceTab theme={theme} setTheme={setTheme} />
          )}
          {activeTab === 'data' && <DataTab session={session} />}
        </div>
      </div>
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  session,
  stats,
}: {
  session: ReturnType<typeof loadSession>;
  stats: { total: number; logins: number; notes: number; cards: number };
}) {
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [draftName, setDraftName] = useState(displayName);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // ADD useEffect to load from API:
  useEffect(() => {
    api
      .get('/api/user/profile')
      .then(({ data }) => {
        setDisplayName(
          data.display_name ?? session?.email?.split('@')[0] ?? 'User'
        );
        setDraftName(
          data.display_name ?? session?.email?.split('@')[0] ?? 'User'
        );
        setPhoto(data.profile_photo ?? null);
        setLoadingProfile(false);
      })
      .catch(() => setLoadingProfile(false));
  }, []);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      alert('Image must be under 200KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    const trimmed =
      draftName.trim() || (session?.email?.split('@')[0] ?? 'User');
    try {
      await api.put('/api/user/profile', {
        displayName: trimmed,
        profilePhoto: photo ?? undefined,
      });
      setDisplayName(trimmed);
      // Clear localStorage leftovers
      localStorage.removeItem('vx_display_name');
      localStorage.removeItem('vx_profile_photo');
      setEditing(false);
    } catch {
      // show error
    }
  }

  function cancelEdit() {
    setDraftName(displayName);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2
          className="text-base font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          Profile
        </h2>
        {!editing ? (
          <button
            onClick={() => {
              setDraftName(displayName);
              setEditing(true);
            }}
            className="text-sm px-3 py-1.5 rounded-lg vx-btn-ghost"
            style={{
              color: 'var(--text-secondary)',
              border: '0.5px solid var(--border)',
            }}
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={cancelEdit}
              className="text-sm px-3 py-1.5 rounded-lg vx-btn-ghost"
              style={{
                color: 'var(--text-muted)',
                border: '0.5px solid var(--border)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveProfile}
              className="text-sm px-3 py-1.5 rounded-lg vx-btn-accent"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* Avatar + identity */}
      <Card>
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              onClick={() => editing && fileRef.current?.click()}
              className="flex items-center justify-center w-20 h-20 rounded-full overflow-hidden text-2xl font-semibold"
              style={{
                background: photo ? 'transparent' : 'var(--accent-subtle)',
                color: 'var(--accent)',
                cursor: editing ? 'pointer' : 'default',
                border: editing
                  ? '2px dashed var(--accent)'
                  : '2px solid transparent',
              }}
            >
              {photo ? (
                <img
                  src={photo}
                  alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (displayName || session?.email || 'U').charAt(0).toUpperCase()
              )}
            </div>
            {editing && (
              <div
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full vx-btn"
                style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              aria-label="Upload profile photo"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          {/* Name + email */}
          <div className="flex-1 min-w-0 pt-1">
            {editing ? (
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm font-medium outline-none vx-input mb-2"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: 16,
                }}
                placeholder="Display name"
                autoFocus
              />
            ) : (
              <p
                className="font-semibold text-lg truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {displayName}
              </p>
            )}
            <p
              className="text-sm truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {session?.email ?? '—'}
            </p>
            {editing && (
              <p
                className="text-xs mt-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Click the photo to upload a new one (max 2MB)
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Vault stats */}
      <Card>
        <SectionLabel>Vault Stats</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total items', value: stats.total },
            { label: 'Logins', value: stats.logins },
            { label: 'Secure notes', value: stats.notes },
            { label: 'Cards', value: stats.cards },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg p-3"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <p
                className="text-2xl font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                {value}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {label}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Account info */}
      <Card>
        <SectionLabel>Account Info</SectionLabel>
        <div className="flex flex-col gap-3">
          {[
            { label: 'Email', value: session?.email ?? '—' },
            { label: 'Encryption', value: 'AES-256-GCM + PBKDF2-SHA256' },
            { label: 'Key derivation', value: '600,000 iterations' },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                borderBottom: '0.5px solid var(--border)',
                paddingBottom: 12,
              }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {label}
              </p>
              <p
                className="text-sm mt-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {value}
              </p>
            </div>
          ))}
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Zero-knowledge status
            </p>
            <p
              className="text-sm mt-0.5 flex items-center gap-1.5"
              style={{ color: '#10B981' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Encrypted before leaving this device
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab({ session }: { session: ReturnType<typeof loadSession> }) {
  const { vaultKey } = useVaultStore();

  // OTP state
  const [otpStep, setOtpStep] = useState<'initial' | 'sent' | 'verified'>(
    'initial'
  );
  const [otpCode, setOtpCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Password state (unlocked only after OTP verified)
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const strength = newPass ? getPasswordStrength(newPass) : null;
  const mismatch = confirm.length > 0 && confirm !== newPass;
  const locked = otpStep !== 'verified';

  async function handleSendOTP() {
    setOtpLoading(true);
    setOtpError('');
    try {
      const { data } = await api.post('/api/auth/otp/send');
      setMaskedEmail(data.maskedEmail);
      setOtpStep('sent');
    } catch (e: any) {
      setOtpError(e.response?.data?.error ?? 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (otpCode.length !== 6) return setOtpError('Enter the 6-digit code');
    setOtpLoading(true);
    setOtpError('');
    try {
      await api.post('/api/auth/otp/verify', { code: otpCode });
      setOtpStep('verified');
      setOtpError('');
    } catch (e: any) {
      setOtpError(e.response?.data?.error ?? 'Invalid code');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleChangePassword() {
    setErrorMsg('');
    if (!currentPass)
      return setErrorMsg(
        'Enter your current password (needed to re-encrypt your vault).'
      );
    if (!newPass || !confirm)
      return setErrorMsg('Fill in all password fields.');
    if (newPass !== confirm) return setErrorMsg('New passwords do not match.');
    if (newPass.length < 12)
      return setErrorMsg('New password must be at least 12 characters.');
    if (!session) return setErrorMsg('Session not found.');

    setSaving(true);
    try {
      const { vaultKey: currentDerivedKey } = await deriveKeys(
        currentPass,
        session.kdfSalt,
        session.kdfParams
      );
      const masterKey = await decryptBytes(
        { ciphertext: session.vaultKeyEnc, iv: session.vaultKeyIv },
        currentDerivedKey
      );

      const newKdfSalt = await generateSalt();
      const newAuthSalt = await generateSalt();
      const { authKey: newAuthKey, vaultKey: newDerivedKey } = await deriveKeys(
        newPass,
        newKdfSalt,
        DEFAULT_KDF_PARAMS
      );
      const { ciphertext: newVaultKeyEnc, iv: newVaultKeyIv } =
        await encryptBytes(masterKey, newDerivedKey);

      await api.put('/api/auth/change-password', {
        newAuthKey: toHex(newAuthKey),
        newAuthSalt,
        newKdfSalt,
        newKdfParams: DEFAULT_KDF_PARAMS,
        newVaultKeyEnc,
        newVaultKeyIv,
      });

      setSuccess(true);
      setCurrentPass('');
      setNewPass('');
      setConfirm('');
      setOtpStep('initial');
      setOtpCode('');
    } catch (e: any) {
      setErrorMsg(
        e.response?.data?.error ??
          e.response?.data?.message ??
          'Failed. Try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2
        className="text-base font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        Security
      </h2>

      <Card>
        <SectionLabel>Change Master Password</SectionLabel>

        {success && (
          <div
            className="rounded-lg px-3 py-2.5 text-sm flex items-center gap-2"
            style={{ background: '#0D2818', color: '#10B981' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            Password changed. All other sessions were signed out.
          </div>
        )}

        {errorMsg && (
          <div
            className="rounded-lg px-3 py-2.5 text-sm"
            style={{ background: '#2A0000', color: 'var(--danger)' }}
          >
            {errorMsg}
          </div>
        )}

        {/* Step 1: OTP verification */}
        <div
          className="flex flex-col gap-3 pb-4"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Step 1 — Verify your identity
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                We'll send a 6-digit code to your email
              </p>
            </div>
            {otpStep === 'verified' && (
              <span
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background: '#0D2818', color: '#10B981' }}
              >
                ✓ Verified
              </span>
            )}
          </div>

          {otpStep === 'initial' && (
            <button
              onClick={handleSendOTP}
              disabled={otpLoading}
              className="self-start px-4 py-2 rounded-lg text-sm font-medium vx-btn-ghost"
              style={{
                border: '0.5px solid var(--border)',
                color: 'var(--text-primary)',
                opacity: otpLoading ? 0.7 : 1,
              }}
            >
              {otpLoading ? 'Sending...' : 'Get OTP'}
            </button>
          )}

          {otpStep === 'sent' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Code sent to{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>
                  {maskedEmail}
                </strong>
              </p>
              {otpError && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  {otpError}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="_ _ _ _ _ _"
                  aria-label="OTP code"
                  className="w-36 rounded-lg px-3 py-2 text-sm font-mono outline-none text-center vx-input tracking-widest"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                    letterSpacing: 8,
                  }}
                />
                <button
                  onClick={handleVerifyOTP}
                  disabled={otpLoading || otpCode.length !== 6}
                  className="px-4 py-2 rounded-lg text-sm font-medium vx-btn-accent"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    opacity: otpLoading || otpCode.length !== 6 ? 0.6 : 1,
                  }}
                >
                  {otpLoading ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  onClick={handleSendOTP}
                  disabled={otpLoading}
                  className="px-3 py-2 rounded-lg text-xs vx-btn"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Resend
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: New password (locked until OTP verified) */}
        <div
          className="flex flex-col gap-3"
          style={{
            opacity: locked ? 0.4 : 1,
            pointerEvents: locked ? 'none' : 'auto',
          }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Step 2 — Set new password
          </p>

          {/* Current password (for vault key derivation) */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Current password{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                (to decrypt your vault key)
              </span>
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                disabled={locked}
                aria-label="Current password"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none pr-14 vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs vx-btn"
                style={{ color: 'var(--text-muted)' }}
              >
                {showCurrent ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* New password + strength */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              New password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                disabled={locked}
                aria-label="New password"
                placeholder="Minimum 12 characters"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none pr-14 vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowNew((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs vx-btn"
                style={{ color: 'var(--text-muted)' }}
              >
                {showNew ? 'Hide' : 'Show'}
              </button>
            </div>
            {strength && newPass.length > 0 && (
              <div className="mt-1.5">
                <div className="flex gap-1 mb-0.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full"
                      style={{
                        background:
                          i <= strength.bars ? strength.color : 'var(--border)',
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

          {/* Confirm */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Confirm new password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={locked}
              aria-label="Confirm new password"
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
            onClick={handleChangePassword}
            disabled={saving || locked || mismatch}
            className="w-full rounded-lg py-2.5 text-sm font-medium vx-btn-accent"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              opacity: saving || locked || mismatch ? 0.6 : 1,
            }}
          >
            {saving ? 'Changing password...' : 'Change password'}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────

function AppearanceTab({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme: (t: string) => void;
}) {
  function applyTheme(t: string) {
    setTheme(t);
    localStorage.setItem('vx_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2
        className="text-base font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        Appearance
      </h2>

      <Card>
        <SectionLabel>Theme</SectionLabel>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Choose how VaultX looks on your device.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              id: 'dark',
              label: 'Dark',
              desc: 'Easy on the eyes',
              preview: {
                base: '#0E0E0E',
                surface: '#141414',
                elevated: '#1C1C1C',
                text: '#F0F0F0',
                border: '#2A2A2A',
              },
            },
            {
              id: 'light',
              label: 'Light',
              desc: 'Clean and bright',
              preview: {
                base: '#DDE3EC',
                surface: '#EBF0F5',
                elevated: '#D0D8E4',
                text: '#0D1B2A',
                border: '#B0BCCB',
              },
            },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => applyTheme(opt.id)}
              aria-label={`${opt.label} theme`}
              className="flex flex-col gap-3 p-4 rounded-xl text-left vx-btn"
              style={{
                border:
                  theme === opt.id
                    ? '2px solid var(--accent)'
                    : '0.5px solid var(--border)',
                background:
                  theme === opt.id
                    ? 'var(--accent-subtle)'
                    : 'var(--bg-elevated)',
              }}
            >
              {/* Preview */}
              <div
                className="w-full rounded-lg overflow-hidden"
                style={{ height: 72, background: opt.preview.base }}
              >
                <div
                  style={{
                    height: 16,
                    background: opt.preview.surface,
                    borderBottom: `0.5px solid ${opt.preview.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '0 6px',
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#10B981',
                    }}
                  />
                  <div
                    style={{
                      width: 30,
                      height: 4,
                      borderRadius: 2,
                      background: opt.preview.elevated,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', height: 56 }}>
                  <div
                    style={{
                      width: 40,
                      background: opt.preview.surface,
                      borderRight: `0.5px solid ${opt.preview.border}`,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      padding: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <div
                      style={{
                        height: 12,
                        borderRadius: 3,
                        background: opt.preview.elevated,
                      }}
                    />
                    <div
                      style={{
                        height: 12,
                        borderRadius: 3,
                        background: '#10B981',
                        opacity: 0.7,
                        width: '60%',
                      }}
                    />
                    <div
                      style={{
                        height: 12,
                        borderRadius: 3,
                        background: opt.preview.elevated,
                        width: '80%',
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {opt.label}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {opt.desc}
                </p>
              </div>
              {theme === opt.id && (
                <div
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--accent)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  Active
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Data Tab ─────────────────────────────────────────────────────────────────

function DataTab({ session }: { session: ReturnType<typeof loadSession> }) {
  const { vaultKey } = useVaultStore();

  // ── existing state ──
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportError, setExportError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // ── ADD CSV state here ──
  const [csvState, setCsvState] = useState<
    'idle' | 'preview' | 'importing' | 'done'
  >('idle');
  const [csvItems, setCsvItems] = useState<ParsedItem[]>([]);
  const [csvFormat, setCsvFormat] = useState('');
  const [csvProgress, setCsvProgress] = useState(0);
  const csvRef = useRef<HTMLInputElement>(null);

  const { clearSession } = useVaultStore();
  const navigate = useNavigate();

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'This permanently deletes your account and ALL vault data.\n\nThis cannot be undone. Type "delete" to confirm.'
    );
    if (!confirmed) return;
    try {
      await api.delete('/api/auth/account');
      clearStoredSession();
      clearSession();
      navigate('/login');
      toast('Account deleted', 'info');
    } catch {
      toast('Failed to delete account. Try again.', 'error');
    }
  }

  // ── ADD CSV handlers here ──
  async function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { items, format } = parseCSV(text);
    if (items.length === 0) {
      alert('No valid items found.');
      return;
    }
    setCsvItems(items);
    setCsvFormat(format);
    setCsvState('preview');
  }

  async function handleImport() {
    if (!vaultKey) return;
    setCsvState('importing');
    for (let i = 0; i < csvItems.length; i++) {
      try {
        const item = csvItems[i];
        const { ciphertext: encryptedData, iv } = await encrypt(
          JSON.stringify({
            title: item.title,
            username: item.username,
            password: item.password,
            url: item.url,
            notes: item.notes,
            passwordChangedAt: new Date().toISOString(),
          }),
          vaultKey
        );
        await api.post('/api/vault/items', {
          type: 'login',
          encryptedData,
          iv,
        });
      } catch {
        /* skip */
      }
      setCsvProgress(i + 1);
    }
    setCsvState('done');
    toast(`Imported ${csvItems.length} items successfully`);

    setCsvState('idle');
  }

  // ── existing handlers below (confirmExport, handleExport, etc.) ──

  async function confirmExport() {
    if (!exportPassword) return setExportError('Enter your master password.');
    if (!session) return setExportError('Session not found.');

    setVerifying(true);
    setExportError('');
    try {
      // Verify password by trying to decrypt vault key
      const { vaultKey: derivedKey } = await deriveKeys(
        exportPassword,
        session.kdfSalt,
        session.kdfParams
      );
      await decryptBytes(
        { ciphertext: session.vaultKeyEnc, iv: session.vaultKeyIv },
        derivedKey
      );

      // Password correct — proceed with export
      setVerifying(false);
      setShowExportModal(false);
      setExportPassword('');
      setExporting(true);

      const { data } = await api.get('/api/vault/items');
      const items = Array.isArray(data) ? data : (data.items ?? []);
      const exportData = {
        version: '1.0',
        app: 'VaultX',
        exportedAt: new Date().toISOString(),
        note: 'Encrypted export. Items only decryptable with your master password.',
        itemCount: items.length,
        items,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaultx-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch {
      setExportError('Incorrect password. Please try again.');
    } finally {
      setVerifying(false);
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2
        className="text-base font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        Data
      </h2>

      {/* Export */}
      <Card>
        <SectionLabel>Export Vault</SectionLabel>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Downloads your encrypted vault as a JSON file. Items remain encrypted
          and require your master password to decrypt.
        </p>
        <button
          onClick={() => {
            setExportPassword('');
            setExportError('');
            setShowExportModal(true);
          }}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium vx-btn-ghost"
          style={{
            background: exportDone ? '#0D2818' : 'var(--bg-elevated)',
            color: exportDone ? '#10B981' : 'var(--text-primary)',
            border: '0.5px solid var(--border)',
            alignSelf: 'flex-start',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {exportDone
            ? 'Downloaded!'
            : exporting
              ? 'Exporting...'
              : 'Export encrypted backup'}
        </button>
      </Card>

      <Card>
        <SectionLabel>Import from Password Manager</SectionLabel>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Import from Chrome, Firefox, LastPass, Bitwarden, or 1Password CSV
          exports.
        </p>

        {csvState === 'idle' && (
          <>
            <button
              onClick={() => csvRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium vx-btn-ghost self-start"
              style={{
                border: '0.5px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Choose CSV file
            </button>
            <input
              ref={csvRef}
              type="file"
              accept=".csv,.txt"
              aria-label="Choose CSV file"
              className="hidden"
              onChange={handleCSVFile}
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Supports: Chrome · Firefox · LastPass · Bitwarden · 1Password
            </p>
          </>
        )}

        {csvState === 'preview' && (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-lg p-3 flex items-center justify-between"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <span
                className="text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                Found <strong>{csvItems.length}</strong> passwords
                <span
                  className="ml-2 text-xs capitalize"
                  style={{ color: 'var(--accent)' }}
                >
                  ({csvFormat} format detected)
                </span>
              </span>
              <button
                onClick={() => setCsvState('idle')}
                className="text-xs vx-btn"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>

            {/* Preview first 3 */}
            <div className="flex flex-col gap-1.5">
              {csvItems.slice(0, 3).map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-2 flex items-center gap-3"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={{
                      background: 'var(--accent-subtle)',
                      color: 'var(--accent)',
                    }}
                  >
                    {item.title.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.title}
                    </p>
                    <p
                      className="text-xs truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {item.username}
                    </p>
                  </div>
                </div>
              ))}
              {csvItems.length > 3 && (
                <p
                  className="text-xs pl-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  + {csvItems.length - 3} more items...
                </p>
              )}
            </div>

            <button
              onClick={handleImport}
              className="rounded-lg py-2.5 text-sm font-medium vx-btn-accent"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Import {csvItems.length} items to vault
            </button>
          </div>
        )}

        {csvState === 'importing' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              Importing... {csvProgress}/{csvItems.length}
            </p>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--border)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(csvProgress / csvItems.length) * 100}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Danger zone */}
      <Card>
        <SectionLabel>Danger Zone</SectionLabel>
        <div
          className="rounded-lg p-4 flex items-center justify-between gap-4"
          style={{
            border: '0.5px solid var(--danger)',
            background: 'rgba(220,38,38,0.05)',
          }}
        >
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Delete account
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Permanently removes your account and all vault data. Cannot be
              undone.
            </p>
          </div>
          <button
            aria-label="Delete account"
            className="px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0 vx-btn-danger"
            style={{
              color: 'var(--danger)',
              border: '0.5px solid var(--danger)',
            }}
            onClick={handleDeleteAccount}
          >
            Delete account
          </button>
        </div>
      </Card>

      {/* Export password modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4 z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowExportModal(false);
              setExportPassword('');
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'var(--bg-surface)',
              border: '0.5px solid var(--border)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Confirm export
              </h3>
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setExportPassword('');
                }}
                aria-label="Close"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm vx-btn"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                }}
              >
                ✕
              </button>
            </div>

            <p
              className="text-sm mb-4"
              style={{ color: 'var(--text-secondary)' }}
            >
              Enter your master password to verify your identity before
              exporting.
            </p>

            {exportError && (
              <div
                className="rounded-lg px-3 py-2 mb-3 text-sm"
                style={{ background: '#2A0000', color: 'var(--danger)' }}
              >
                {exportError}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Master password
                </label>
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmExport()}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none vx-input"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="Enter your master password"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowExportModal(false);
                    setExportPassword('');
                  }}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium vx-btn-ghost"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmExport}
                  disabled={verifying}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium vx-btn-accent"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    opacity: verifying ? 0.7 : 1,
                  }}
                >
                  {verifying ? 'Verifying...' : 'Export'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
