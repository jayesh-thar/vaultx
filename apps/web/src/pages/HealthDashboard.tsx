import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { decrypt } from '../lib/crypto';
import { useVaultStore } from '../store/useVaultStore';
import type { VaultItem } from '../store/useVaultStore';
import type { ItemPayload } from './Dashboard';

// ─── HIBP k-anonymity check ───────────────────────────────────────────────────
async function checkBreached(password: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-1', encoder.encode(password));
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    const text = await res.text();
    return text.split('\r\n').some((line) => line.split(':')[0] === suffix);
  } catch {
    return false;
  }
}

function getStrengthBars(password: string): number {
  if (password.length < 8) return 1;
  let score = 0;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length < 12) return score >= 3 ? 2 : 1;
  if (score <= 1) return 2;
  if (score <= 2) return 3;
  return 4;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalyzedItem {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  strengthBars: number;
  isBreached: boolean;
  isReused: boolean;
  passwordAgeDays: number | null;
  issues: string[];
}

type CheckStatus = 'idle' | 'decrypting' | 'checking' | 'done';

// ─── Score card ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
  const label = score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'At Risk';
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 22, fontWeight: 600, fill: color }}
        >
          {score}
        </text>
      </svg>
      <span className="text-xs font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HealthDashboard() {
  const navigate = useNavigate();
  const { vaultKey } = useVaultStore();

  const [items, setItems] = useState<AnalyzedItem[]>([]);
  const [status, setStatus] = useState<CheckStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'breached' | 'weak' | 'reused' | 'old'
  >('all');

  const runAnalysis = useCallback(async () => {
    if (!vaultKey) return;
    setStatus('decrypting');
    setItems([]);

    // Step 1: Fetch + decrypt
    const { data } = await api.get('/api/vault/items');
    const rawItems: VaultItem[] = Array.isArray(data)
      ? data
      : (data.items ?? []);
    const loginItems = rawItems.filter((i) => i.type === 'login');

    const decrypted: Array<{ id: string; payload: ItemPayload }> = [];
    for (const item of loginItems) {
      try {
        const plain = await decrypt(
          { ciphertext: item.encrypted_data, iv: item.iv },
          vaultKey
        );
        decrypted.push({
          id: item.id,
          payload: JSON.parse(plain) as ItemPayload,
        });
      } catch {
        /* skip */
      }
    }

    // Step 2: Find reused passwords
    const passwordMap = new Map<string, string[]>();
    decrypted.forEach(({ id, payload }) => {
      const p = payload.password ?? '';
      if (!p) return;
      const existing = passwordMap.get(p) ?? [];
      passwordMap.set(p, [...existing, id]);
    });

    // Step 3: HIBP checks
    setStatus('checking');
    setTotal(decrypted.length);
    setProgress(0);

    const analyzed: AnalyzedItem[] = [];

    for (let i = 0; i < decrypted.length; i++) {
      const { id, payload } = decrypted[i];
      const password = payload.password ?? '';
      const strengthBars = password ? getStrengthBars(password) : 1;
      const isReused = (passwordMap.get(password)?.length ?? 1) > 1;
      const isBreached = password ? await checkBreached(password) : false;

      const passwordAgeDays = payload.passwordChangedAt
        ? Math.floor(
            (Date.now() - new Date(payload.passwordChangedAt).getTime()) /
              86400000
          )
        : null;

      const issues: string[] = [];
      if (isBreached) issues.push('breached');
      if (strengthBars <= 2) issues.push('weak');
      if (isReused) issues.push('reused');
      if (passwordAgeDays !== null && passwordAgeDays > 180) issues.push('old');

      analyzed.push({
        id,
        title: payload.title ?? 'Unknown',
        username: payload.username ?? '',
        password,
        url: payload.url ?? '',
        strengthBars,
        isBreached,
        isReused,
        passwordAgeDays,
        issues,
      });

      setProgress(i + 1);
      // Rate limit: 1 HIBP request per 1.5s
      if (i < decrypted.length - 1)
        await new Promise((r) => setTimeout(r, 1500));
    }

    setItems(analyzed);
    setStatus('done');
  }, [vaultKey]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  // Compute health score
  const loginCount = items.length;
  const breachedCount = items.filter((i) => i.isBreached).length;
  const weakCount = items.filter((i) => i.strengthBars <= 2).length;
  const reusedCount = items.filter((i) => i.isReused).length;
  const oldCount = items.filter(
    (i) => i.passwordAgeDays !== null && i.passwordAgeDays > 180
  ).length;

  const issuePoints =
    breachedCount * 40 + weakCount * 20 + reusedCount * 15 + oldCount * 10;
  const maxPoints = loginCount * 40;
  const score =
    loginCount === 0
      ? 100
      : Math.max(0, Math.round(100 - (issuePoints / maxPoints) * 100));

  const filtered = items.filter((item) => {
    if (activeFilter === 'breached') return item.isBreached;
    if (activeFilter === 'weak') return item.strengthBars <= 2;
    if (activeFilter === 'reused') return item.isReused;
    if (activeFilter === 'old')
      return item.passwordAgeDays !== null && item.passwordAgeDays > 180;
    return item.issues.length > 0;
  });

  const FILTERS: Array<{
    id: typeof activeFilter;
    label: string;
    count: number;
    color: string;
  }> = [
    {
      id: 'all',
      label: 'All Issues',
      count: items.filter((i) => i.issues.length > 0).length,
      color: 'var(--text-muted)',
    },
    {
      id: 'breached',
      label: '🔴 Breached',
      count: breachedCount,
      color: '#EF4444',
    },
    { id: 'weak', label: '🟡 Weak', count: weakCount, color: '#F59E0B' },
    { id: 'reused', label: '🟠 Reused', count: reusedCount, color: '#F97316' },
    {
      id: 'old',
      label: '📅 Old',
      count: oldCount,
      color: 'var(--text-secondary)',
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
            onClick={runAnalysis}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg vx-btn-ghost"
            style={{
              color: 'var(--text-secondary)',
              border: '0.5px solid var(--border)',
            }}
          >
            Re-check
          </button>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Loading state */}
        {(status === 'decrypting' || status === 'checking') && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: 'var(--accent)',
                borderTopColor: 'transparent',
              }}
            />
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {status === 'decrypting'
                ? 'Decrypting vault items...'
                : `Checking breaches... ${progress}/${total}`}
            </p>
            {status === 'checking' && (
              <>
                <div
                  className="w-64 h-1.5 rounded-full overflow-hidden"
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
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Checking Have I Been Pwned database...
                </p>
              </>
            )}
          </div>
        )}

        {status === 'done' && (
          <>
            {/* Score + summary */}
            <div
              className="rounded-2xl p-6 mb-6 flex flex-wrap items-center gap-8"
              style={{
                background: 'var(--bg-surface)',
                border: '0.5px solid var(--border)',
              }}
            >
              <ScoreRing score={score} />

              <div
                className="flex-1 grid grid-cols-2 gap-3"
                style={{ minWidth: 240 }}
              >
                {FILTERS.slice(1).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id)}
                    className="rounded-xl p-4 text-left vx-btn-ghost"
                    style={{
                      background:
                        activeFilter === f.id
                          ? 'var(--bg-elevated)'
                          : 'var(--bg-elevated)',
                      border:
                        activeFilter === f.id
                          ? `1px solid ${f.color}`
                          : '0.5px solid var(--border)',
                    }}
                  >
                    <p
                      className="text-2xl font-semibold"
                      style={{ color: f.color }}
                    >
                      {f.count}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {f.label.replace(/[🔴🟡🟠📅] /, '')}
                    </p>
                  </button>
                ))}
              </div>

              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                <p>
                  {loginCount} login{loginCount !== 1 ? 's' : ''} analyzed
                </p>
                <p className="mt-1">
                  {items.filter((i) => i.issues.length === 0).length} all clear
                </p>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium vx-btn"
                  style={{
                    background:
                      activeFilter === f.id
                        ? 'var(--accent-subtle)'
                        : 'var(--bg-surface)',
                    color:
                      activeFilter === f.id
                        ? 'var(--accent)'
                        : 'var(--text-secondary)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {/* Items list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <p className="text-4xl">✅</p>
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {activeFilter === 'all'
                    ? 'No issues found!'
                    : `No ${activeFilter} passwords`}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl p-4 vx-card"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '0.5px solid var(--border)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-medium"
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
                          {item.username}
                        </p>
                      </div>

                      {/* Issue badges */}
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {item.isBreached && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: '#EF4444',
                            }}
                          >
                            🔴 Breached
                          </span>
                        )}
                        {item.strengthBars <= 2 && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-md font-medium"
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
                            className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{
                              background: 'rgba(249,115,22,0.15)',
                              color: '#F97316',
                            }}
                          >
                            🟠 Reused
                          </span>
                        )}
                        {item.passwordAgeDays !== null &&
                          item.passwordAgeDays > 180 && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-md"
                              style={{
                                background: 'var(--bg-elevated)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              📅 {item.passwordAgeDays}d old
                            </span>
                          )}
                      </div>
                    </div>

                    {/* Action advice */}
                    {item.isBreached && (
                      <p
                        className="text-xs mt-3 pl-12"
                        style={{ color: '#EF4444' }}
                      >
                        ⚠ This password appeared in a data breach. Change it
                        immediately.
                      </p>
                    )}
                    {!item.isBreached && item.strengthBars <= 2 && (
                      <p
                        className="text-xs mt-3 pl-12"
                        style={{ color: '#F59E0B' }}
                      >
                        Password is too weak. Use 12+ characters with symbols.
                      </p>
                    )}
                    {item.isReused && !item.isBreached && (
                      <p
                        className="text-xs mt-3 pl-12"
                        style={{ color: '#F97316' }}
                      >
                        Same password used on multiple sites — use a unique
                        password.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Idle / empty vault */}
        {status === 'idle' && (
          <div className="flex items-center justify-center py-24">
            <button
              onClick={runAnalysis}
              className="px-6 py-3 rounded-xl text-sm font-medium vx-btn-accent"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Start Health Check
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
