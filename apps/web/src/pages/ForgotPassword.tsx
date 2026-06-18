import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  deriveKeys,
  generateSalt,
  toHex,
  DEFAULT_KDF_PARAMS,
} from '../lib/kdf';
import {
  decryptBytes,
  encryptBytes,
  generateVaultKey,
  recoveryKeyFromString,
} from '../lib/crypto';

type Step = 'email' | 'otp' | 'recovery' | 'newpass' | 'done';

function getStrength(p: string) {
  let s = 0;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return {
    bars: s,
    color: s <= 1 ? '#EF4444' : s === 2 ? '#F59E0B' : '#10B981',
    label: s <= 1 ? 'Weak' : s === 2 ? 'Fair' : s === 3 ? 'Good' : 'Strong',
  };
}

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(0);
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timerActive, setTimerActive] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryFile, setRecoveryFile] = useState<File | null>(null);
  const [recoveryMethod, setRecoveryMethod] = useState<'key' | 'otp' | null>(
    null
  );

  const otpCode = otpDigits.join('');
  const otpExpired = timerActive && otpTimer <= 0;
  const strength = newPass ? getStrength(newPass) : null;

  const startTimer = () => {
    setOtpTimer(600);
    setTimerActive(true);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  async function handleSendOTP() {
    if (!email.trim()) return setError('Enter your email address.');
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/api/auth/forgot-password/send-otp', {
        email: email.toLowerCase().trim(),
      });
      setMaskedEmail(data.maskedEmail);
      setOtpDigits(['', '', '', '', '', '']);
      setStep('otp');
      startTimer();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed to send code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (otpCode.length !== 6) return setError('Enter the 6-digit code.');
    setStep('newpass');
    setError('');
  }

  async function handleReset() {
    if (!newPass || !confirm) return setError('Fill in all fields.');
    if (newPass !== confirm) return setError('Passwords do not match.');
    if (newPass.length < 12)
      return setError('Password must be at least 12 characters.');
    if (strength && strength.bars < 2)
      return setError('Choose a stronger password.');
    if (!accepted)
      return setError(
        'You must acknowledge the data loss warning to continue.'
      );

    setLoading(true);
    setError('');
    try {
      const newKdfSalt = await generateSalt();
      const newAuthSalt = await generateSalt();
      const { authKey: newAuthKey, vaultKey: newDerivedKey } = await deriveKeys(
        newPass,
        newKdfSalt,
        DEFAULT_KDF_PARAMS
      );
      const masterKey = await generateVaultKey();
      const { ciphertext: newVaultKeyEnc, iv: newVaultKeyIv } =
        await encryptBytes(masterKey, newDerivedKey);

      await api.post('/api/auth/forgot-password/reset', {
        email: email.toLowerCase().trim(),
        code: otpCode,
        newAuthKey: toHex(newAuthKey),
        newAuthSalt,
        newKdfSalt,
        newKdfParams: DEFAULT_KDF_PARAMS,
        newVaultKeyEnc,
        newVaultKeyIv,
      });

      setStep('done');
    } catch (e: any) {
      setError(
        e.response?.data?.error ?? 'Reset failed. The code may have expired.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryFileUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const match = text.match(/Recovery Key:\s*([0-9A-F-]+)/i);
    if (match) {
      setRecoveryKeyInput(match[1].trim());
    } else {
      setRecoveryKeyInput(text.trim());
    }
    setRecoveryFile(file);
  }

  async function handleRecoveryReset() {
    if (!recoveryKeyInput.trim())
      return setError('Enter or upload your recovery key.');
    if (!newPass || !confirm) return setError('Fill in all password fields.');
    if (newPass !== confirm) return setError('Passwords do not match.');
    if (newPass.length < 12)
      return setError('Password must be at least 12 characters.');

    setLoading(true);
    setError('');
    try {
      const recoveryKey = recoveryKeyFromString(recoveryKeyInput.trim());

      const { data } = await api.get(
        `/api/auth/forgot-password/recovery-data?email=${encodeURIComponent(email.toLowerCase().trim())}`
      );

      const masterKey = await decryptBytes(
        { ciphertext: data.recovery_key_enc, iv: data.recovery_key_iv },
        recoveryKey
      );

      if (masterKey.length !== 32) {
        throw new Error('Invalid recovery key');
      }

      const newKdfSalt = await generateSalt();
      const newAuthSalt = await generateSalt();
      const { authKey: newAuthKey, vaultKey: newDerivedKey } = await deriveKeys(
        newPass,
        newKdfSalt,
        DEFAULT_KDF_PARAMS
      );
      const { ciphertext: newVaultKeyEnc, iv: newVaultKeyIv } =
        await encryptBytes(masterKey, newDerivedKey);

      await api.post('/api/auth/forgot-password/recovery-key', {
        email: email.toLowerCase().trim(),
        newAuthKey: toHex(newAuthKey),
        newAuthSalt,
        newKdfSalt,
        newKdfParams: DEFAULT_KDF_PARAMS,
        newVaultKeyEnc,
        newVaultKeyIv,
      });

      setStep('done');
    } catch {
      setError("Invalid recovery key or it doesn't match this account.");
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
            Reset master password
          </h1>
          <p
            className="text-sm mt-1 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            Verify your identity to set a new password
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {(recoveryMethod === 'key'
            ? ['Email', 'Recovery Key', 'Done']
            : ['Email', 'Verify', 'New Password']
          ).map((label, i) => {
            const stepNum = i + 1;
            const current =
              step === 'email'
                ? 1
                : step === 'otp' || step === 'recovery'
                  ? 2
                  : step === 'newpass'
                    ? 3
                    : 4;
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{
                      background:
                        current > stepNum
                          ? 'var(--accent)'
                          : current === stepNum
                            ? 'var(--accent-subtle)'
                            : 'var(--border)',
                      color:
                        current > stepNum
                          ? '#fff'
                          : current === stepNum
                            ? 'var(--accent)'
                            : 'var(--text-muted)',
                      border:
                        current === stepNum
                          ? '1.5px solid var(--accent)'
                          : 'none',
                    }}
                  >
                    {current > stepNum ? '✓' : stepNum}
                  </div>
                  <span
                    className="text-xs hidden sm:inline"
                    style={{
                      color:
                        current === stepNum
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {label}
                  </span>
                </div>
                {i < 2 && (
                  <div
                    className="flex-1 h-px"
                    style={{
                      background:
                        current > stepNum + 1
                          ? 'var(--accent)'
                          : 'var(--border)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 mb-4 text-sm"
            style={{ background: '#2A0000', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        {/* ─── Step 1: Email + method choice ────────────────────── */}
        {step === 'email' && (
          <div className="flex flex-col gap-4">
            <div
              className="rounded-lg p-3 text-xs"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '0.5px solid rgba(239,68,68,0.3)',
                color: '#EF4444',
              }}
            >
              <p className="font-semibold mb-1">
                ⚠ Important — read before continuing
              </p>
              <p>
                If you use the email-code method, your saved items will become{' '}
                <strong>permanently unreadable</strong> (zero-knowledge — we
                can't decrypt them without your old password). If you have a
                recovery key, use it instead to keep your vault intact.
              </p>
              <p className="mt-1">
                If you remember your password,{' '}
                <Link
                  to="/login"
                  style={{ color: '#EF4444', textDecoration: 'underline' }}
                >
                  go back and try again
                </Link>
                .
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Your account email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                autoFocus
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                How do you want to reset?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRecoveryMethod('key')}
                  className="flex-1 py-2.5 rounded-lg text-xs font-medium"
                  style={{
                    background:
                      recoveryMethod === 'key'
                        ? 'var(--accent)'
                        : 'var(--bg-elevated)',
                    color:
                      recoveryMethod === 'key'
                        ? '#fff'
                        : 'var(--text-secondary)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  Recovery key
                  <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                    Keeps your vault
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryMethod('otp')}
                  className="flex-1 py-2.5 rounded-lg text-xs font-medium"
                  style={{
                    background:
                      recoveryMethod === 'otp'
                        ? 'var(--accent)'
                        : 'var(--bg-elevated)',
                    color:
                      recoveryMethod === 'otp'
                        ? '#fff'
                        : 'var(--text-secondary)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  Email code
                  <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                    Vault becomes empty
                  </div>
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                if (!email.trim()) return setError('Enter your email address.');
                if (!recoveryMethod)
                  return setError('Choose a reset method above.');
                setError('');
                if (recoveryMethod === 'key') {
                  setStep('recovery');
                } else {
                  handleSendOTP();
                }
              }}
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-medium"
              style={{
                background:
                  recoveryMethod === 'key' ? 'var(--accent)' : 'var(--danger)',
                color: '#fff',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading
                ? 'Sending code...'
                : recoveryMethod === 'key'
                  ? 'Continue with recovery key'
                  : 'Send reset code'}
            </button>
          </div>
        )}

        {/* ─── Step 2a: OTP ──────────────────────────────────────── */}
        {step === 'otp' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Code sent to{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>
                  {maskedEmail}
                </strong>
              </p>
              <p
                className="text-xs font-mono"
                style={{
                  color: otpTimer <= 60 ? '#EF4444' : 'var(--text-muted)',
                }}
              >
                {Math.floor(otpTimer / 60)}:
                {(otpTimer % 60).toString().padStart(2, '0')}
              </p>
            </div>

            <div className="flex gap-2 justify-center">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                  key={i}
                  id={`fp-otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otpDigits[i]}
                  disabled={otpExpired}
                  onChange={(e) => {
                    const digit = e.target.value.replace(/\D/g, '').slice(-1);
                    const next = [...otpDigits];
                    next[i] = digit;
                    setOtpDigits(next);
                    if (digit && i < 5)
                      document.getElementById(`fp-otp-${i + 1}`)?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !otpDigits[i] && i > 0)
                      document.getElementById(`fp-otp-${i - 1}`)?.focus();
                    if (e.key === 'Enter' && otpCode.length === 6)
                      handleVerifyOTP();
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData
                      .getData('text')
                      .replace(/\D/g, '')
                      .slice(0, 6);
                    const next = [...otpDigits];
                    pasted.split('').forEach((d, idx) => {
                      if (idx < 6) next[idx] = d;
                    });
                    setOtpDigits(next);
                    document
                      .getElementById(
                        `fp-otp-${Math.min(pasted.length - 1, 5)}`
                      )
                      ?.focus();
                  }}
                  className="outline-none text-center text-sm font-semibold font-mono rounded-lg"
                  style={{
                    width: 44,
                    height: 48,
                    background: 'var(--bg-elevated)',
                    border: otpDigits[i]
                      ? '1.5px solid var(--accent)'
                      : '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                    opacity: otpExpired ? 0.5 : 1,
                  }}
                />
              ))}
            </div>

            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: 'var(--border)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(otpTimer / 600) * 100}%`,
                  background: otpTimer <= 60 ? '#EF4444' : 'var(--accent)',
                  transition: 'width 1s linear',
                }}
              />
            </div>

            {otpExpired ? (
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: '#EF4444' }}>
                  Code expired.
                </p>
                <button
                  onClick={handleSendOTP}
                  className="text-xs vx-btn"
                  style={{ color: 'var(--accent)' }}
                >
                  Resend code
                </button>
              </div>
            ) : (
              <button
                onClick={handleVerifyOTP}
                disabled={otpCode.length !== 6}
                className="w-full rounded-lg py-2.5 text-sm font-medium"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: otpCode.length !== 6 ? 0.5 : 1,
                }}
              >
                Verify code
              </button>
            )}

            <button
              onClick={() => setStep('email')}
              className="text-xs text-center vx-btn"
              style={{ color: 'var(--text-muted)' }}
            >
              ← Use different email
            </button>
          </div>
        )}

        {/* ─── Step 2b: Recovery key ─────────────────────────────── */}
        {step === 'recovery' && (
          <div className="flex flex-col gap-4">
            <div
              className="rounded-lg p-3 text-xs"
              style={{
                background: 'rgba(16,185,129,0.08)',
                border: '0.5px solid rgba(16,185,129,0.3)',
                color: 'var(--accent)',
              }}
            >
              <p className="font-semibold mb-1">
                ✓ Your vault will be preserved
              </p>
              <p style={{ color: 'var(--text-secondary)' }}>
                Upload your recovery key file or enter the code manually. All
                your saved items will remain intact.
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Upload recovery key file
              </label>
              <input
                type="file"
                accept=".txt"
                onChange={handleRecoveryFileUpload}
                aria-label="Upload recovery key file"
                className="w-full text-sm p-1 cursor-pointer"
                style={{
                  color: 'var(--text-secondary)',
                  border: '0.5px solid rgba(16,185,129,0.3)',
                }}
              />
              {recoveryFile && (
                <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
                  ✓ Loaded: {recoveryFile.name}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-px"
                style={{ background: 'var(--border)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                or enter manually
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: 'var(--border)' }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Recovery key
              </label>
              <input
                type="text"
                value={recoveryKeyInput}
                onChange={(e) =>
                  setRecoveryKeyInput(e.target.value.toUpperCase())
                }
                placeholder="XXXX-XXXX-XXXX-XXXX-..."
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none font-mono vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                New master password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
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
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs vx-btn"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPass ? 'Hide' : 'Show'}
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
                            i <= strength.bars
                              ? strength.color
                              : 'var(--border)',
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
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border:
                    confirm && confirm !== newPass
                      ? '0.5px solid var(--danger)'
                      : '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              {confirm && confirm !== newPass && (
                <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              onClick={handleRecoveryReset}
              disabled={
                loading ||
                !recoveryKeyInput ||
                !newPass ||
                !confirm ||
                newPass !== confirm
              }
              className="w-full rounded-lg py-2.5 text-sm font-medium"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                opacity:
                  loading ||
                  !recoveryKeyInput ||
                  !newPass ||
                  !confirm ||
                  newPass !== confirm
                    ? 0.5
                    : 1,
              }}
            >
              {loading ? 'Restoring vault...' : 'Reset password & keep vault'}
            </button>

            <button
              onClick={() => {
                setStep('email');
                setError('');
              }}
              className="text-xs text-center vx-btn"
              style={{ color: 'var(--text-muted)' }}
            >
              ← Back
            </button>
          </div>
        )}

        {/* ─── Step 3: New Password (OTP path only) ─────────────── */}
        {step === 'newpass' && (
          <div className="flex flex-col gap-4">
            <div
              className="rounded-lg p-3 text-xs"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '0.5px solid rgba(239,68,68,0.3)',
                color: '#EF4444',
              }}
            >
              <p className="font-semibold mb-1">
                ⚠ Last chance — your vault will be cleared
              </p>
              <p>
                All saved passwords will be <strong>permanently deleted</strong>{' '}
                when you set a new master password.
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                New master password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
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
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs vx-btn"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPass ? 'Hide' : 'Show'}
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
                            i <= strength.bars
                              ? strength.color
                              : 'var(--border)',
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
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none vx-input"
                style={{
                  background: 'var(--bg-elevated)',
                  border:
                    confirm && confirm !== newPass
                      ? '0.5px solid var(--danger)'
                      : '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              {confirm && confirm !== newPass && (
                <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                  Passwords do not match
                </p>
              )}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
                style={{ accentColor: 'var(--danger)' }}
              />
              <span
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                I understand that resetting my password will{' '}
                <strong style={{ color: '#EF4444' }}>
                  permanently delete all my saved vault data
                </strong>{' '}
                and this cannot be undone.
              </span>
            </label>

            <button
              onClick={handleReset}
              disabled={
                loading ||
                !accepted ||
                !newPass ||
                !confirm ||
                newPass !== confirm
              }
              className="w-full rounded-lg py-2.5 text-sm font-medium"
              style={{
                background: 'var(--danger)',
                color: '#fff',
                opacity:
                  loading ||
                  !accepted ||
                  !newPass ||
                  !confirm ||
                  newPass !== confirm
                    ? 0.5
                    : 1,
              }}
            >
              {loading ? 'Resetting...' : 'Reset password & clear vault'}
            </button>
          </div>
        )}

        {/* ─── Done ──────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--accent-subtle)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="text-center">
              <p
                className="text-base font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Password reset complete
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {recoveryMethod === 'key'
                  ? 'Your vault has been preserved. Log in with your new master password.'
                  : 'Your vault has been cleared. Log in with your new master password to start fresh.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full rounded-lg py-2.5 text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Go to login
            </button>
          </div>
        )}

        {step !== 'done' && (
          <p
            className="text-center text-sm mt-6"
            style={{ color: 'var(--text-muted)' }}
          >
            Remember it?{' '}
            <Link to="/login" style={{ color: 'var(--accent)' }}>
              Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
