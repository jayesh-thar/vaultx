import { useState, useRef, useEffect, useMemo } from 'react';
import { getFaviconUrl } from '../lib/favicon';
import { generateTOTP, type TOTPResult } from '../lib/totp';
import type {
  PasswordHistoryEntry,
  DecryptedVaultItem,
} from '../pages/Dashboard';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

interface Props {
  item: DecryptedVaultItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
}

function CopyField({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        marginBottom: 8,
      }}
    >
      <span
        className="text-xs"
        style={{
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          className="text-sm font-mono"
          style={{
            color: 'var(--text-secondary)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {secret && !show ? '••••••••' : value}
        </span>
        {secret && (
          <button
            onClick={() => setShow((s) => !s)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs px-2 py-1 rounded"
          style={{
            background: copied ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
            border: '0.5px solid var(--border)',
            color: copied ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

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

// HistoryRow helper component
function HistoryRow({ entry }: { entry: PasswordHistoryEntry }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [age, setAge] = useState('');

  useEffect(() => {
    // Date.now() is safe in useEffect — not called during render
    const now = Date.now();
    const days = Math.floor(
      (now - new Date(entry.changedAt).getTime()) / 86400000
    );
    if (days === 0) setAge('Today');
    else if (days === 1) setAge('1 day ago');
    else if (days < 30) setAge(`${days}d ago`);
    else if (days < 365) setAge(`${Math.floor(days / 30)}mo ago`);
    else setAge(`${Math.floor(days / 365)}y ago`);
  }, [entry.changedAt]);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ borderBottom: '0.5px solid var(--border)' }}
    >
      <span
        className="flex-1 text-xs font-mono"
        style={{ color: 'var(--text-secondary)', letterSpacing: show ? 0 : 3 }}
      >
        {show ? entry.password : '••••••••••'}
      </span>
      <span
        className="text-xs"
        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
      >
        {age}
      </span>
      <button
        onClick={() => setShow((p) => !p)}
        className="text-xs vx-btn"
        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
      >
        {show ? 'Hide' : 'Show'}
      </button>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(entry.password);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        aria-label="Copy old password"
        className="text-xs vx-btn"
        style={{
          color: copied ? 'var(--accent)' : 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}

export default function VaultItemCard({
  item,
  onEdit,
  onDelete,
  onToggleFavorite,
  onShare,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyCountdown] = useState<number | null>(null);
  const [faviconError, setFaviconError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const { payload, type } = item;
  const faviconUrl =
    type === 'login' && payload.url ? getFaviconUrl(payload.url) : null;
  const strength =
    type === 'login' && payload.password
      ? getPasswordStrength(payload.password)
      : null;
  const initials = payload.title.slice(0, 2).toUpperCase();
  const [totp, setTotp] = useState<TOTPResult | null>(null);
  const [totpCopied, setTotpCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  //browser notification permission request
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // TOTP auto-refresh every second
  useEffect(() => {
    if (!payload.totpSecret) return;

    let cancelled = false;

    async function refresh() {
      if (cancelled || !payload.totpSecret) return;
      const result = await generateTOTP(payload.totpSecret);
      if (!cancelled) setTotp(result);
    }

    refresh();
    const id = setInterval(refresh, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [payload.totpSecret]);

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);

      // Auto-clear clipboard after 30 seconds
      setTimeout(async () => {
        await navigator.clipboard.writeText('').catch(() => {});

        // Browser notification when clipboard clears (optional, needs permission)
        if (Notification.permission === 'granted') {
          new Notification('VaultX', {
            body: 'Password removed from clipboard',
            silent: true,
            tag: 'clipboard-clear',
          });
        }
      }, 30_000);
    } catch {
      // Clipboard API not available — fail silently
    }
  }

  const passwordAge = useMemo(() => {
    if (!payload.passwordChangedAt) return null;
    const days = Math.floor(
      (new Date().getTime() - new Date(payload.passwordChangedAt).getTime()) /
        86400000
    );
    if (days === 0) return 'Changed today';
    if (days === 1) return 'Changed yesterday';
    if (days < 30) return `Changed ${days}d ago`;
    if (days < 365) return `Changed ${Math.floor(days / 30)}mo ago`;
    return `Changed ${Math.floor(days / 365)}y ago`;
  }, [payload.passwordChangedAt]);

  const passwordAgeDays = payload.passwordChangedAt
    ? Math.floor(
        (new Date().getTime() - new Date(payload.passwordChangedAt).getTime()) /
          86400000
      )
    : 0;

  function handleDelete() {
    if (item.type === 'card') {
      // Cards need PIN verification — redirect to extension or show modal
      // For web app, re-derive authKey is complex; use a simpler approach:
      // Show a warning that card deletion requires PIN reset from settings
      const confirmed = window.confirm(
        'Deleting a card requires confirmation.\n\nThis card is PIN-protected. Click OK to delete anyway.'
      );
      if (confirmed) onDelete();
      return;
    }
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  // Type badge config
  const typeBadge = {
    login: { label: 'Login', color: '#10B981', bg: '#0D2818' },
    note: { label: 'Note', color: '#8B5CF6', bg: '#1E1433' },
    card: { label: 'Card', color: '#3B82F6', bg: '#0D1F33' },
  }[type] ?? { label: type, color: '#666', bg: '#1C1C1C' };

  return (
    <div
      className="rounded-xl flex flex-col vx-card"
      style={{
        background: 'var(--bg-surface)',
        border: '0.5px solid var(--border)',
      }}
    >
      {/* Top section */}
      <div className="p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Icon: favicon or initials */}
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 text-xs font-medium overflow-hidden"
            style={{
              background:
                faviconUrl && !faviconError
                  ? 'var(--bg-elevated)'
                  : 'var(--accent-subtle)',
              color: 'var(--accent)',
            }}
          >
            {faviconUrl && !faviconError ? (
              <img
                src={faviconUrl}
                alt=""
                width={24}
                height={24}
                onError={() => setFaviconError(true)}
                style={{ objectFit: 'contain' }}
              />
            ) : (
              initials
            )}
          </div>

          {/* Title + subtitle */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className="text-sm font-medium truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {payload.title}
              </p>
            </div>
            <p
              className="text-xs truncate mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              {type === 'login' && (payload.username || payload.url || '—')}
              {type === 'note' &&
                (payload.content
                  ? payload.content.slice(0, 40) + '...'
                  : 'Empty note')}
              {type === 'card' &&
                (payload.number
                  ? `•••• ${payload.number.slice(-4)}`
                  : payload.cardholder || '—')}
            </p>
            {item.created_at && (
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--text-muted)', opacity: 0.6 }}
              >
                Added {relativeTime(item.created_at)}
              </p>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {item.category && (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                {item.category}
              </span>
            )}
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: typeBadge.bg, color: typeBadge.color }}
            >
              {typeBadge.label}
            </span>
          </div>
        </div>

        {/* Password strength (login only) */}
        {strength && strength.bars > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 flex-1">
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
        {type === 'login' && passwordAge && (
          <p
            className="text-xs"
            style={{
              color:
                passwordAgeDays > 180
                  ? '#EF4444'
                  : passwordAgeDays > 90
                    ? '#F59E0B'
                    : 'var(--text-muted)',
            }}
          >
            🕐 {passwordAge}
          </p>
        )}
        {/* TOTP Code */}
        {type === 'login' && payload.totpSecret && totp && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-elevated)', marginTop: 4 }}
          >
            {/* Countdown ring */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              className="flex-shrink-0"
            >
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="var(--border)"
                strokeWidth="2"
              />
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke={
                  totp.secondsRemaining <= 5 ? '#EF4444' : 'var(--accent)'
                }
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 8}`}
                strokeDashoffset={`${2 * Math.PI * 8 * (1 - totp.progress)}`}
                strokeLinecap="round"
                transform="rotate(-90 10 10)"
                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
              />
              <text
                x="10"
                y="10"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontSize: 7,
                  fill:
                    totp.secondsRemaining <= 5
                      ? '#EF4444'
                      : 'var(--text-muted)',
                }}
              >
                {totp.secondsRemaining}
              </text>
            </svg>

            <span
              className="flex-1 font-mono text-sm font-semibold tracking-widest"
              style={{
                color:
                  totp.secondsRemaining <= 5
                    ? '#EF4444'
                    : 'var(--text-primary)',
              }}
            >
              {totp.formatted}
            </span>

            <button
              onClick={async () => {
                await navigator.clipboard.writeText(totp.code);
                setTotpCopied(true);
                setTimeout(() => setTotpCopied(false), 2000);
              }}
              aria-label="Copy TOTP code"
              className="text-xs vx-btn"
              style={{
                color: totpCopied ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {totpCopied ? '✓' : 'Copy'}
            </button>
          </div>
        )}

        {/* Copy row — Login */}
        {type === 'login' && payload.password && (
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2"
            style={{ background: 'var(--bg-elevated)' }}
          >
            <span
              className="text-sm font-mono tracking-widest"
              style={{ color: 'var(--text-secondary)' }}
            >
              ••••••••••••
            </span>
            <button
              onClick={() => handleCopy(payload.password!)}
              className="text-xs font-medium tabular-nums vx-btn"
              style={{
                color:
                  copyCountdown !== null
                    ? 'var(--warning)'
                    : 'var(--text-muted)',
              }}
            >
              {copyCountdown !== null ? `${copyCountdown}s` : 'Copy'}
            </button>
          </div>
        )}

        {/* Copy row — Card */}
        {type === 'card' && payload.number && (
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2"
            style={{ background: 'var(--bg-elevated)' }}
          >
            <span
              className="text-sm font-mono"
              style={{ color: 'var(--text-secondary)' }}
            >
              •••• •••• •••• {payload.number.slice(-4)}
            </span>
            <button
              onClick={() => handleCopy(payload.number!)}
              className="text-xs font-medium vx-btn"
              style={{ color: 'var(--text-muted)' }}
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        {/* Favorite — standalone button */}
        <button
          onClick={onToggleFavorite}
          aria-label={
            payload.favorite ? 'Remove from favorites' : 'Add to favorites'
          }
          className="flex items-center justify-center w-7 h-7 rounded-lg vx-btn"
          style={{
            background: payload.favorite
              ? 'rgba(245,158,11,0.15)'
              : 'var(--bg-elevated)',
            color: payload.favorite ? '#F59E0B' : 'var(--text-muted)',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill={payload.favorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* History — only for login items with saved history */}
        {type === 'login' && (payload.passwordHistory?.length ?? 0) > 0 && (
          <button
            onClick={() => setShowHistory((p) => !p)}
            aria-label="Show password history"
            className="flex items-center justify-center w-7 h-7 rounded-lg vx-btn"
            style={{
              background: showHistory
                ? 'var(--accent-subtle)'
                : 'var(--bg-elevated)',
              color: showHistory ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <polyline
                points="12 8 12 12 14 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M3.05 11a9 9 0 1 0 .5-4.4M3 7v4h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        {/* Share */}
        <button
          onClick={onShare}
          aria-label="Share"
          className="flex items-center justify-center w-7 h-7 rounded-lg vx-btn"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <circle
              cx="18"
              cy="5"
              r="3"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="6"
              cy="12"
              r="3"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="18"
              cy="19"
              r="3"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </button>

        <button
          onClick={() => setShowDetails((p) => !p)}
          className="flex-1 text-xs py-1.5 rounded-lg vx-btn-ghost"
          style={{
            color: showDetails ? 'var(--accent)' : 'var(--text-secondary)',
            background: showDetails
              ? 'var(--accent-subtle)'
              : 'var(--bg-elevated)',
            border: showDetails ? '0.5px solid var(--accent)' : 'none',
          }}
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>

        <button
          onClick={onEdit}
          className="flex-1 text-xs py-1.5 rounded-lg vx-btn-ghost"
          style={{
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
          }}
        >
          Edit
        </button>

        <button
          onClick={handleDelete}
          className="flex-1 text-xs py-1.5 rounded-lg transition-all vx-btn-danger"
          style={{
            color: confirmDelete ? '#fff' : 'var(--danger)',
            background: confirmDelete ? 'var(--danger)' : 'transparent',
            border: '0.5px solid var(--danger)',
          }}
        >
          {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>

      {/* Details expand panel */}
      {showDetails && (
        <div
          className="mx-4 mb-3 rounded-xl overflow-hidden"
          style={{
            border: '0.5px solid var(--border)',
            background: 'var(--bg-elevated)',
          }}
        >
          <div className="px-3 pt-3 pb-2">
            {type === 'login' && (
              <>
                {payload.username && (
                  <CopyField label="Username" value={payload.username} />
                )}
                {(payload as any).email && (
                  <CopyField label="Email" value={(payload as any).email} />
                )}
                {payload.password && (
                  <CopyField label="Password" value={payload.password} secret />
                )}
                {payload.url && <CopyField label="URL" value={payload.url} />}
                {payload.notes && (
                  <CopyField label="Notes" value={payload.notes} />
                )}
                {payload.totpSecret && (
                  <CopyField
                    label="TOTP Secret"
                    value={payload.totpSecret}
                    secret
                  />
                )}
                {(payload.customFields ?? []).map((f: any) => (
                  <CopyField
                    key={f.id}
                    label={f.label || 'Custom field'}
                    value={f.value}
                    secret={f.type === 'password'}
                  />
                ))}
              </>
            )}
            {type === 'note' && (
              <>
                {payload.content && (
                  <CopyField label="Content" value={payload.content} />
                )}
                {payload.notes && (
                  <CopyField label="Notes" value={payload.notes} />
                )}
                {(payload.customFields ?? []).map((f: any) => (
                  <CopyField
                    key={f.id}
                    label={f.label || 'Custom field'}
                    value={f.value}
                    secret={f.type === 'password'}
                  />
                ))}
              </>
            )}
            {type === 'card' && (
              <>
                {payload.cardholder && (
                  <CopyField label="Cardholder" value={payload.cardholder} />
                )}
                {payload.number && (
                  <CopyField
                    label="Card Number"
                    value={payload.number.replace(/(.{4})/g, '$1 ').trim()}
                    secret
                  />
                )}
                {payload.expiry && (
                  <CopyField label="Expiry" value={payload.expiry} />
                )}
                {payload.cvv && (
                  <CopyField label="CVV" value={payload.cvv} secret />
                )}
                {payload.notes && (
                  <CopyField label="Notes" value={payload.notes} />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Password History Panel — OUTSIDE the action bar */}
      {showHistory && (payload.passwordHistory?.length ?? 0) > 0 && (
        <div
          className="mx-4 mb-3 rounded-lg overflow-hidden"
          style={{
            border: '0.5px solid var(--border)',
            background: 'var(--bg-elevated)',
          }}
        >
          <div
            className="px-3 py-2"
            style={{ borderBottom: '0.5px solid var(--border)' }}
          >
            <p
              className="text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Password history (last {payload.passwordHistory!.length})
            </p>
          </div>
          {payload.passwordHistory!.map((entry, i) => (
            <HistoryRow key={i} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
