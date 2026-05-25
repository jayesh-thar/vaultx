import { useState, useRef, useEffect, useMemo } from 'react';
import type { DecryptedVaultItem } from '../pages/Dashboard';
import { getFaviconUrl } from '../lib/favicon';

interface Props {
  item: DecryptedVaultItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
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

export default function VaultItemCard({
  item,
  onEdit,
  onDelete,
  onToggleFavorite,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyCountdown, setCopyCountdown] = useState<number | null>(null);
  const [faviconError, setFaviconError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { payload, type } = item;
  const faviconUrl =
    type === 'login' && payload.url ? getFaviconUrl(payload.url) : null;
  const strength =
    type === 'login' && payload.password
      ? getPasswordStrength(payload.password)
      : null;
  const initials = payload.title.slice(0, 2).toUpperCase();

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopyCountdown(30);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCopyCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(intervalRef.current!);
          navigator.clipboard.writeText('').catch(() => {});
          return null;
        }
        return prev - 1;
      });
    }, 1000);
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
        {/* Favorite */}
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
    </div>
  );
}
