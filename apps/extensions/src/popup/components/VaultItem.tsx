import { useEffect, useState } from 'react';
import type { DecryptedItem } from '../../types';
import CardPinGate from './CardPinGate';

interface Props {
  item: DecryptedItem;
  onDeleted?: (id: string) => void;
  expandedId: string | null;
  onExpand: (id: string) => void;
}

const PIN_DURATION = 5 * 60 * 1000;

async function getPinSessionValid(): Promise<boolean> {
  const r = await chrome.storage.session.get('cardPinVerifiedAt');
  const ts = r.cardPinVerifiedAt as number | undefined;
  return !!ts && Date.now() - ts < PIN_DURATION;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function CopyBtn({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      style={{ ...btn, ...(copied ? btnDone : {}) }}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? '✓' : label}
    </button>
  );
}

const btn: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 5,
  border: 'none',
  background: '#334155',
  color: '#94a3b8',
  fontSize: 11,
  cursor: 'pointer',
  fontWeight: 500,
  flexShrink: 0,
};
const btnDone: React.CSSProperties = {
  background: '#10b98133',
  color: '#10b981',
};

function Field({
  label,
  value,
  secret,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          fontSize: 9,
          color: '#475569',
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: 12,
            color: '#cbd5e1',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: secret ? 'monospace' : 'inherit',
          }}
        >
          {secret && !show ? '••••••••' : value}
        </span>
        {secret && (
          <button
            style={{ ...btn, padding: '2px 6px' }}
            onClick={(e) => {
              e.stopPropagation();
              setShow((s) => !s);
            }}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        )}
        <CopyBtn value={value} />
      </div>
    </div>
  );
}

export default function VaultItem({
  item,
  onDeleted,
  expandedId,
  onExpand,
}: Props) {
  // expanded = true only if THIS item's id matches the currently expanded id
  const expanded = expandedId === item.id;

  const [cardUnlocked, setCardUnlocked] = useState(false);
  const [showPinGate, setShowPinGate] = useState<'view' | 'delete' | null>(
    null
  );
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Auto-relock card after 5 min
  useEffect(() => {
    if (!cardUnlocked) return;
    const t = setTimeout(async () => {
      setCardUnlocked(false);
      await chrome.storage.session.remove('cardPinVerifiedAt');
    }, PIN_DURATION);
    return () => clearTimeout(t);
  }, [cardUnlocked]);

  function toggleExpand() {
    onExpand(item.id); // parent toggles — if same id, collapses; if different, expands this one
  }

  function openWebApp() {
    chrome.tabs.create({ url: 'http://localhost:5173/dashboard' });
  }

  async function deleteItem() {
    try {
      const { apiRequest } = await import('../../lib/api');
      const r = await chrome.storage.session.get('session');
      const session = r.session as { accessToken: string } | undefined;
      if (!session) return;
      await apiRequest(`/api/vault/items/${item.id}`, {
        method: 'DELETE',
        token: session.accessToken,
      });
      onDeleted?.(item.id);
    } catch {
      alert('Failed to delete');
    }
  }

  const { payload } = item;

  const domain = payload.url
    ? (() => {
        try {
          const u = payload.url.startsWith('http')
            ? payload.url
            : 'https://' + payload.url;
          return new URL(u).hostname;
        } catch {
          return payload.url;
        }
      })()
    : null;

  const createdText = item.created_at
    ? `Added ${relativeTime(item.created_at)}`
    : null;

  const pwAgeText = (() => {
    if (!payload.passwordChangedAt) return null;
    const d = new Date(payload.passwordChangedAt);
    if (isNaN(d.getTime())) return null;
    return `Password changed ${relativeTime(payload.passwordChangedAt)}`;
  })();

  const typeIcon =
    item.type === 'login' ? '🔑' : item.type === 'note' ? '📝' : '💳';

  const metaText =
    item.type === 'login'
      ? payload.username || domain || '—'
      : item.type === 'note'
        ? 'Secure note'
        : cardUnlocked
          ? `•••• ${payload.number?.slice(-4) ?? '••••'}`
          : payload.cardholder || 'Payment card';

  // ── PIN GATE ───────────────────────────────────────────────────────────────
  if (showPinGate) {
    return (
      <div style={card}>
        <CardPinGate
          action={showPinGate}
          itemTitle={payload.title}
          onSuccess={async () => {
            if (showPinGate === 'view') {
              setCardUnlocked(true);
              onExpand(item.id); // expand after unlock
            } else {
              await deleteItem();
            }
            setShowPinGate(null);
          }}
          onCancel={() => setShowPinGate(null)}
        />
      </div>
    );
  }

  // ── DELETE CONFIRM ─────────────────────────────────────────────────────────
  if (deleteConfirm) {
    return (
      <div
        style={{
          ...card,
          flexDirection: 'column',
          padding: '10px 12px',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, flex: 1 }}
          >
            Delete "{payload.title.slice(0, 20)}
            {payload.title.length > 20 ? '...' : ''}"?
          </span>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Cannot be undone
          </span>
          <button
            style={{
              ...btn,
              background: '#dc2626',
              color: '#fff',
              padding: '4px 10px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              deleteItem();
            }}
          >
            Delete
          </button>
          <button
            style={{ ...btn, padding: '4px 10px' }}
            onClick={() => setDeleteConfirm(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (item.type === 'login') {
    return (
      <div style={{ ...card, flexDirection: 'column', padding: 0 }}>
        <div style={header} onClick={toggleExpand}>
          <div style={iconBox}>{typeIcon}</div>
          <div style={infoCol}>
            <p style={titleStyle}>{payload.title}</p>
            <p style={metaStyle}>
              {metaText}
              {createdText && (
                <span style={createdStyle}> · {createdText}</span>
              )}
            </p>
          </div>
          <div style={actRow} onClick={(e) => e.stopPropagation()}>
            {payload.url && (
              <button
                style={{ ...btn, ...blueBtn }}
                onClick={() => {
                  let u = payload.url!;
                  if (!u.startsWith('http')) u = 'https://' + u;
                  chrome.tabs.create({ url: u });
                }}
              >
                ↗
              </button>
            )}
            <button style={{ ...btn, color: '#60a5fa' }} onClick={openWebApp}>
              Edit
            </button>
            <button
              style={{ ...btn, color: '#f87171' }}
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirm(true);
              }}
            >
              🗑
            </button>
            <span style={chevron}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {expanded && (
          <div style={expandBody}>
            {pwAgeText && <p style={pwAgeStyle}>🕐 {pwAgeText}</p>}
            <div style={fieldGrid}>
              {payload.username && (
                <Field label="Username" value={payload.username} />
              )}
              {(payload as any).email && (
                <Field label="Email" value={(payload as any).email} />
              )}
              {payload.password && (
                <Field label="Password" value={payload.password} secret />
              )}
              {payload.url && <Field label="URL" value={payload.url} />}
              {payload.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Notes" value={payload.notes} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── NOTE ───────────────────────────────────────────────────────────────────
  if (item.type === 'note') {
    return (
      <div style={{ ...card, flexDirection: 'column', padding: 0 }}>
        <div style={header} onClick={toggleExpand}>
          <div style={iconBox}>{typeIcon}</div>
          <div style={infoCol}>
            <p style={titleStyle}>{payload.title}</p>
            <p style={metaStyle}>
              Secure note
              {createdText && (
                <span style={createdStyle}> · {createdText}</span>
              )}
            </p>
          </div>
          <div style={actRow} onClick={(e) => e.stopPropagation()}>
            <button style={{ ...btn, color: '#60a5fa' }} onClick={openWebApp}>
              Edit
            </button>
            <button
              style={{ ...btn, color: '#f87171' }}
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirm(true);
              }}
            >
              🗑
            </button>
            <span style={chevron}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {expanded && (
          <div style={expandBody}>
            {payload.content ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p
                  style={{
                    fontSize: 13,
                    color: '#94a3b8',
                    lineHeight: 1.6,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {payload.content}
                </p>
                <CopyBtn value={payload.content} label="Copy content" />
              </div>
            ) : (
              <p style={{ color: '#475569', fontSize: 12 }}>No content</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── CARD ───────────────────────────────────────────────────────────────────
  if (item.type === 'card') {
    return (
      <div style={{ ...card, flexDirection: 'column', padding: 0 }}>
        <div
          style={header}
          onClick={async () => {
            if (!cardUnlocked) {
              const valid = await getPinSessionValid();
              if (valid) {
                setCardUnlocked(true);
                onExpand(item.id);
              } else setShowPinGate('view');
            } else {
              toggleExpand();
            }
          }}
        >
          <div style={iconBox}>{typeIcon}</div>
          <div style={infoCol}>
            <p style={titleStyle}>{payload.title}</p>
            <p style={metaStyle}>
              {metaText}
              {createdText && (
                <span style={createdStyle}> · {createdText}</span>
              )}
            </p>
          </div>
          <div style={actRow} onClick={(e) => e.stopPropagation()}>
            {!cardUnlocked ? (
              <button
                style={{ ...btn, ...blueBtn }}
                onClick={async (e) => {
                  e.stopPropagation();
                  const valid = await getPinSessionValid();
                  if (valid) {
                    setCardUnlocked(true);
                    onExpand(item.id);
                  } else setShowPinGate('view');
                }}
              >
                🔓 View
              </button>
            ) : (
              <button
                style={btn}
                onClick={async (e) => {
                  e.stopPropagation();
                  setCardUnlocked(false);
                  onExpand(''); // collapse by passing empty id
                  await chrome.storage.session.remove('cardPinVerifiedAt');
                }}
              >
                🔒
              </button>
            )}
            <button
              style={{ ...btn, color: '#60a5fa' }}
              onClick={(e) => {
                e.stopPropagation();
                openWebApp();
              }}
            >
              Edit
            </button>
            <button
              style={{ ...btn, color: '#f87171' }}
              onClick={(e) => {
                e.stopPropagation();
                setShowPinGate('delete');
              }}
            >
              🗑
            </button>
            {cardUnlocked && (
              <span style={chevron}>{expanded ? '▲' : '▼'}</span>
            )}
          </div>
        </div>
        {cardUnlocked && expanded && (
          <div style={expandBody}>
            <div style={fieldGrid}>
              {payload.cardholder && (
                <Field label="Cardholder" value={payload.cardholder} />
              )}
              {payload.number && (
                <Field
                  label="Card Number"
                  value={payload.number.replace(/(.{4})/g, '$1 ').trim()}
                />
              )}
              {payload.expiry && (
                <Field label="Expiry" value={payload.expiry} />
              )}
              {payload.cvv && <Field label="CVV" value={payload.cvv} secret />}
              {payload.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Notes" value={payload.notes} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

const card: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  borderRadius: 10,
  background: '#0f172a',
  border: '1px solid #1e293b',
};
const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  cursor: 'pointer',
  width: '100%',
  minHeight: 50,
};
const iconBox: React.CSSProperties = {
  fontSize: 16,
  flexShrink: 0,
  width: 32,
  height: 32,
  borderRadius: 7,
  background: '#1e293b',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const infoCol: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
};
const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#f1f5f9',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  margin: 0,
};
const metaStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  margin: '2px 0 0',
};
const createdStyle: React.CSSProperties = { color: '#3b82f6', fontSize: 10 };
const actRow: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  flexShrink: 0,
};
const chevron: React.CSSProperties = {
  color: '#334155',
  fontSize: 10,
  userSelect: 'none',
};
const blueBtn: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#38bdf8',
};
const expandBody: React.CSSProperties = {
  padding: '0 12px 12px',
  borderTop: '1px solid #1e293b',
  width: '100%',
};
const fieldGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  paddingTop: 10,
};
const pwAgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  margin: '8px 0 0',
};
