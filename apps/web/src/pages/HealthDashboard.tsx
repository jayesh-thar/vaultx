import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { decrypt } from '../lib/crypto';
import { useVaultStore } from '../store/useVaultStore';
import type { VaultItem } from '../store/useVaultStore';
import type { ItemPayload } from './Dashboard';

async function checkBreached(password: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-1', encoder.encode(password));
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const res = await fetch(
      `https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`,
      { headers: { 'Add-Padding': 'true' } }
    );
    return (await res.text())
      .split('\r\n')
      .some((l) => l.split(':')[0] === hex.slice(5));
  } catch {
    return false;
  }
}

function strengthBars(p: string): number {
  if (p.length < 8) return 1;
  let s = 0;
  if (/[A-Z]/.test(p)) s++;
  if (/[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length < 12) return Math.min(s, 2);
  return s <= 1 ? 2 : s === 2 ? 3 : 4;
}

interface AnalyzedItem {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  bars: number;
  isBreached: boolean;
  isReused: boolean;
  ageDays: number | null;
  issues: string[];
}

type Status = 'idle' | 'decrypting' | 'checking' | 'done';

export default function HealthDashboard() {
  const navigate = useNavigate();
  const { vaultKey } = useVaultStore();
  const [items, setItems] = useState<AnalyzedItem[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<
    'all' | 'breached' | 'weak' | 'reused' | 'old'
  >('all');

  const run = useCallback(async () => {
    if (!vaultKey) return;
    setStatus('decrypting');
    setItems([]);

    const { data } = await api.get('/api/vault/items');
    const raw: VaultItem[] = Array.isArray(data) ? data : (data.items ?? []);
    const logins = raw.filter((i) => i.type === 'login');

    const dec: { id: string; payload: ItemPayload }[] = [];
    for (const item of logins) {
      try {
        const plain = await decrypt(
          { ciphertext: item.encrypted_data, iv: item.iv },
          vaultKey
        );
        dec.push({ id: item.id, payload: JSON.parse(plain) });
      } catch {
        /* skip */
      }
    }

    const passMap = new Map<string, string[]>();
    dec.forEach(({ id, payload }) => {
      const p = payload.password ?? '';
      if (p) passMap.set(p, [...(passMap.get(p) ?? []), id]);
    });

    setStatus('checking');
    setTotal(dec.length);
    setProgress(0);
    const analyzed: AnalyzedItem[] = [];

    for (let i = 0; i < dec.length; i++) {
      const { id, payload } = dec[i];
      const pw = payload.password ?? '';
      const bars = pw ? strengthBars(pw) : 1;
      const isReused = (passMap.get(pw)?.length ?? 1) > 1;
      const isBreached = pw ? await checkBreached(pw) : false;
      const ageDays = payload.passwordChangedAt
        ? Math.floor(
            (Date.now() - new Date(payload.passwordChangedAt).getTime()) /
              86400000
          )
        : null;

      const issues: string[] = [];
      if (isBreached) issues.push('breached');
      if (bars <= 2) issues.push('weak');
      if (isReused) issues.push('reused');
      if (ageDays !== null && ageDays > 180) issues.push('old');

      analyzed.push({
        id,
        title: payload.title ?? 'Unknown',
        username: payload.username ?? '',
        password: pw,
        url: payload.url ?? '',
        bars,
        isBreached,
        isReused,
        ageDays,
        issues,
      });
      setProgress(i + 1);
      if (i < dec.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }

    setItems(analyzed);
    setStatus('done');
    const breached = analyzed.filter((i) => i.isBreached).map((i) => i.title);
    if (breached.length > 0)
      api.post('/api/vault/breach-alert', { sites: breached }).catch(() => {});
  }, [vaultKey]);

  useEffect(() => {
    run();
  }, [run]);

  const n = items.length;
  const breachedN = items.filter((i) => i.isBreached).length;
  const weakN = items.filter((i) => i.bars <= 2).length;
  const reusedN = items.filter((i) => i.isReused).length;
  const oldN = items.filter(
    (i) => i.ageDays !== null && i.ageDays > 180
  ).length;
  const issueItems = items.filter((i) => i.issues.length > 0).length;
  const score =
    n === 0
      ? 100
      : Math.max(
          0,
          Math.round(
            100 -
              ((breachedN * 40 + weakN * 20 + reusedN * 15 + oldN * 10) /
                (n * 40)) *
                100
          )
        );
  const scoreColor =
    score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
  const scoreLabel = score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'At Risk';

  const TABS = [
    {
      id: 'all' as const,
      label: 'All Issues',
      count: issueItems,
      color: 'var(--text-secondary)',
    },
    {
      id: 'breached' as const,
      label: 'Breached',
      count: breachedN,
      color: '#EF4444',
      icon: '🔴',
    },
    {
      id: 'weak' as const,
      label: 'Weak',
      count: weakN,
      color: '#F59E0B',
      icon: '🟡',
    },
    {
      id: 'reused' as const,
      label: 'Reused',
      count: reusedN,
      color: '#F97316',
      icon: '🔄',
    },
    {
      id: 'old' as const,
      label: 'Old',
      count: oldN,
      color: '#64748B',
      icon: '📅',
    },
  ];

  const displayed = items.filter((item) => {
    if (filter === 'breached') return item.isBreached;
    if (filter === 'weak') return item.bars <= 2;
    if (filter === 'reused') return item.isReused;
    if (filter === 'old') return item.ageDays !== null && item.ageDays > 180;
    return item.issues.length > 0;
  });

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
            />
          </svg>
          Dashboard
        </button>
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          Vault Health
        </span>
        {status === 'done' && (
          <button
            onClick={run}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg vx-btn-ghost"
            style={{
              color: 'var(--text-secondary)',
              border: '0.5px solid var(--border)',
            }}
          >
            ↻ Re-check
          </button>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Loading */}
        {(status === 'decrypting' || status === 'checking') && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="relative w-20 h-20">
              <svg
                className="animate-spin"
                width="80"
                height="80"
                viewBox="0 0 80 80"
              >
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="6"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="6"
                  strokeDasharray="53 160"
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg">
                🔍
              </span>
            </div>
            <div className="text-center">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {status === 'decrypting'
                  ? 'Decrypting vault...'
                  : `Checking breaches... ${progress}/${total}`}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {status === 'checking'
                  ? 'Using k-anonymity — your passwords are never sent'
                  : 'Analyzing passwords locally...'}
              </p>
            </div>
            {status === 'checking' && (
              <div className="w-64 flex flex-col gap-1.5">
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--border)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(progress / total) * 100}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
                <p
                  className="text-xs text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {progress} of {total} checked
                </p>
              </div>
            )}
          </div>
        )}

        {/* Idle */}
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'var(--accent-subtle)' }}
            >
              🔒
            </div>
            <p
              className="text-base font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Check your vault health
            </p>
            <p
              className="text-sm text-center max-w-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Scan for breached, weak, and reused passwords. Uses Have I Been
              Pwned k-anonymity — your passwords never leave your device.
            </p>
            <button
              onClick={run}
              className="px-6 py-3 rounded-xl text-sm font-medium vx-btn-accent"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Start health check
            </button>
          </div>
        )}

        {/* Results */}
        {status === 'done' && (
          <div className="flex flex-col gap-6">
            {/* Hero score card */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--bg-surface)',
                border: '0.5px solid var(--border)',
              }}
            >
              {/* Score bar header */}
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <p
                      className="text-xs font-medium mb-0.5"
                      style={{
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Vault Health Score
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-4xl font-bold"
                        style={{ color: scoreColor }}
                      >
                        {score}
                      </span>
                      <span
                        className="text-lg"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        /100
                      </span>
                      <span
                        className="text-sm font-medium ml-1"
                        style={{ color: scoreColor }}
                      >
                        {scoreLabel}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {n} login{n !== 1 ? 's' : ''} analyzed
                  </p>
                </div>
                {/* Score bar */}
                <div
                  className="h-3 rounded-full overflow-hidden"
                  style={{ background: 'var(--border)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${score}%`, background: scoreColor }}
                  />
                </div>
              </div>

              {/* Issue metrics */}
              <div
                className="grid grid-cols-4"
                style={{ borderTop: '0.5px solid var(--border)' }}
              >
                {TABS.slice(1).map((tab, i) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    className="vx-btn flex flex-col items-center gap-1 py-4"
                    style={{
                      borderRight: i < 3 ? '0.5px solid var(--border)' : 'none',
                      background:
                        filter === tab.id
                          ? 'var(--bg-elevated)'
                          : 'transparent',
                    }}
                  >
                    <span
                      className="text-2xl font-bold"
                      style={{
                        color: tab.count > 0 ? tab.color : 'var(--text-muted)',
                      }}
                    >
                      {tab.count}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {tab.label}
                    </span>
                    {tab.count > 0 && filter !== tab.id && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: tab.color }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium vx-btn"
                  style={{
                    background:
                      filter === tab.id
                        ? 'var(--accent-subtle)'
                        : 'var(--bg-surface)',
                    color:
                      filter === tab.id
                        ? 'var(--accent)'
                        : 'var(--text-secondary)',
                    border: `0.5px solid ${filter === tab.id ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {tab.id !== 'all' && tab.icon + ' '}
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {/* Items list */}
            {displayed.length === 0 ? (
              <div
                className="flex flex-col items-center py-16 gap-3 rounded-2xl"
                style={{
                  background: 'var(--bg-surface)',
                  border: '0.5px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 40 }}>✅</span>
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {filter === 'all'
                    ? 'No issues found! Your vault looks great.'
                    : `No ${filter} passwords`}
                </p>
                {filter !== 'all' && (
                  <button
                    onClick={() => setFilter('all')}
                    className="text-xs vx-btn"
                    style={{ color: 'var(--accent)' }}
                  >
                    View all
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayed.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl vx-card"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '0.5px solid var(--border)',
                      overflow: 'hidden',
                    }}
                  >
                    <div className="flex items-center gap-3 p-4">
                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{
                          background: 'var(--accent-subtle)',
                          color: 'var(--accent)',
                        }}
                      >
                        {item.title.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {item.title}
                        </p>
                        <p
                          className="text-xs truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {item.username || item.url}
                        </p>
                      </div>

                      {/* Issue badges */}
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {item.isBreached && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: '#EF4444',
                            }}
                          >
                            🔴 Breached
                          </span>
                        )}
                        {item.bars <= 2 && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: 'rgba(245,158,11,0.15)',
                              color: '#F59E0B',
                            }}
                          >
                            🟡 Weak
                          </span>
                        )}
                        {item.isReused && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: 'rgba(249,115,22,0.15)',
                              color: '#F97316',
                            }}
                          >
                            🔄 Reused
                          </span>
                        )}
                        {item.ageDays !== null && item.ageDays > 180 && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background: 'var(--bg-elevated)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            📅 {item.ageDays}d old
                          </span>
                        )}
                        <button
                          onClick={() => navigate('/dashboard')}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium ml-1 vx-btn-ghost"
                          style={{
                            color: 'var(--accent)',
                            border: '0.5px solid var(--accent)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Fix →
                        </button>
                      </div>
                    </div>

                    {/* Bottom advice bar */}
                    <div
                      className="px-4 py-2"
                      style={{
                        borderTop: '0.5px solid var(--border)',
                        background: 'var(--bg-elevated)',
                      }}
                    >
                      <p
                        className="text-xs"
                        style={{
                          color: item.isBreached
                            ? '#EF4444'
                            : item.bars <= 2
                              ? '#F59E0B'
                              : item.isReused
                                ? '#F97316'
                                : 'var(--text-muted)',
                        }}
                      >
                        {item.isBreached
                          ? '⚠ This password was found in a data breach. Change it immediately.'
                          : item.bars <= 2
                            ? 'Password is too weak. Generate a strong one with 12+ characters.'
                            : item.isReused
                              ? 'Same password on multiple sites. Use a unique password for each.'
                              : `Password hasn't changed in ${item.ageDays} days. Consider updating it.`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
