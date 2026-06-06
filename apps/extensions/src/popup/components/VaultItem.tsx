import { useEffect, useState } from 'react';
import type { DecryptedItem } from '../../types';
import CardPinGate from './CardPinGate';

interface Props {
  item: DecryptedItem;
  onDeleted?: (id: string) => void;
}

const PIN_DURATION = 5 * 60 * 1000;

async function getPinSessionValid(): Promise<boolean> {
  const r = await chrome.storage.session.get('cardPinVerifiedAt');
  const ts = r.cardPinVerifiedAt as number | undefined;
  return !!ts && Date.now() - ts < PIN_DURATION;
}

function maskCard(num: string): string {
  const clean = num.replace(/\s/g, '');
  return `•••• •••• •••• ${clean.slice(-4)}`;
}

export default function VaultItem({ item, onDeleted }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cardUnlocked, setCardUnlocked] = useState(false);
  const [showPinGate, setShowPinGate] = useState<'view' | 'delete' | null>(
    null
  );
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Auto-relock card after 5 minutes
  useEffect(() => {
    if (!cardUnlocked) return;
    const timer = setTimeout(async () => {
      setCardUnlocked(false);
      await chrome.storage.session.remove('cardPinVerifiedAt');
    }, PIN_DURATION);
    return () => clearTimeout(timer);
  }, [cardUnlocked]);

  function copy(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  }

  function openUrl() {
    let url = item.payload.url ?? '';
    if (!url.startsWith('http')) url = 'https://' + url;
    chrome.tabs.create({ url });
  }

  async function handleCardViewClick() {
    if (cardUnlocked) {
      setCardUnlocked(false);
      await chrome.storage.session.remove('cardPinVerifiedAt');
      return;
    }
    const valid = await getPinSessionValid();
    if (valid) {
      setCardUnlocked(true);
      return;
    }
    setShowPinGate('view');
  }

  async function handleDeleteClick() {
    if (item.type === 'card') {
      setShowPinGate('delete');
    } else {
      setDeleteConfirm(true);
    }
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
          const u = payload.url!.startsWith('http')
            ? payload.url!
            : 'https://' + payload.url;
          return new URL(u).hostname;
        } catch {
          return payload.url;
        }
      })()
    : null;

  // ── PIN GATE ───────────────────────────────────────────────────────────────
  if (showPinGate) {
    return (
      <div style={s.card}>
        <CardPinGate
          action={showPinGate}
          itemTitle={payload.title}
          onSuccess={async () => {
            if (showPinGate === 'view') setCardUnlocked(true);
            else await deleteItem();
            setShowPinGate(null);
          }}
          onCancel={() => setShowPinGate(null)}
        />
      </div>
    );
  }

  // ── DELETE CONFIRM (non-card) ──────────────────────────────────────────────
  if (deleteConfirm) {
    return (
      <div style={s.card}>
        <div style={{ width: '100%' }}>
          <p
            style={{
              fontSize: 13,
              color: '#f1f5f9',
              margin: '0 0 4px',
              fontWeight: 600,
            }}
          >
            Delete "{payload.title}"?
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
            This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                ...s.btn,
                background: '#dc2626',
                color: '#fff',
                flex: 1,
              }}
              onClick={deleteItem}
            >
              Delete
            </button>
            <button
              style={{ ...s.btn, flex: 1 }}
              onClick={() => setDeleteConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (item.type === 'login') {
    return (
      <div style={s.card}>
        <div style={s.iconBox}>🔑</div>
        <div style={s.info}>
          <p style={s.title}>{payload.title}</p>
          <p style={s.meta}>{payload.username || domain || '—'}</p>
        </div>
        <div style={s.actions}>
          {payload.username && (
            <button
              style={s.btn}
              onClick={() => copy(payload.username!, 'user')}
            >
              {copied === 'user' ? '✓' : 'User'}
            </button>
          )}
          {payload.password && (
            <button
              style={s.btn}
              onClick={() => copy(payload.password!, 'pass')}
            >
              {copied === 'pass' ? '✓' : 'Pass'}
            </button>
          )}
          {payload.url && (
            <button style={{ ...s.btn, ...s.blue }} onClick={openUrl}>
              ↗
            </button>
          )}
          <button style={{ ...s.btn, ...s.danger }} onClick={handleDeleteClick}>
            🗑
          </button>
        </div>
      </div>
    );
  }

  // ── NOTE ───────────────────────────────────────────────────────────────────
  if (item.type === 'note') {
    return (
      <div
        style={{
          ...s.card,
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            cursor: 'pointer',
          }}
          onClick={() => setExpanded((e) => !e)}
        >
          <div style={s.iconBox}>📝</div>
          <div style={{ ...s.info, flex: 1 }}>
            <p style={s.title}>{payload.title}</p>
            <p style={s.meta}>Secure note</p>
          </div>
          <div style={s.actions} onClick={(e) => e.stopPropagation()}>
            {expanded && payload.content && (
              <button
                style={s.btn}
                onClick={() => copy(payload.content!, 'note')}
              >
                {copied === 'note' ? '✓' : 'Copy'}
              </button>
            )}
            <button
              style={{ ...s.btn, ...s.danger }}
              onClick={handleDeleteClick}
            >
              🗑
            </button>
            <span style={{ color: '#475569', fontSize: 11 }}>
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </div>
        {/* Content */}
        {expanded && (
          <div
            style={{ padding: '0 12px 12px', borderTop: '1px solid #1e293b' }}
          >
            <p
              style={{
                fontSize: 13,
                color: '#94a3b8',
                lineHeight: 1.6,
                margin: '10px 0 0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {payload.content || 'No content'}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── CARD ───────────────────────────────────────────────────────────────────
  if (item.type === 'card') {
    return (
      <div
        style={{
          ...s.card,
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header row — always visible */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
          }}
        >
          <div style={s.iconBox}>💳</div>
          <div style={{ ...s.info, flex: 1 }}>
            <p style={s.title}>{payload.title}</p>
            <p style={s.meta}>
              {cardUnlocked
                ? maskCard(payload.number ?? '•••• •••• •••• ••••')
                : payload.cardholder || 'Payment card'}
            </p>
          </div>
          <div style={s.actions}>
            {!cardUnlocked ? (
              <button
                style={{ ...s.btn, ...s.blue }}
                onClick={handleCardViewClick}
              >
                🔓 View
              </button>
            ) : (
              <button style={s.btn} onClick={handleCardViewClick}>
                🔒
              </button>
            )}
            <button
              style={{ ...s.btn, ...s.danger }}
              onClick={handleDeleteClick}
            >
              🗑
            </button>
          </div>
        </div>

        {/* Unlocked details row */}
        {cardUnlocked && (
          <div
            style={{
              borderTop: '1px solid #1e293b',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Card fields */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {payload.cardholder && (
                <span style={s.chip}>👤 {payload.cardholder}</span>
              )}
              {payload.number && (
                <span
                  style={{
                    ...s.chip,
                    fontFamily: 'monospace',
                    letterSpacing: 1,
                  }}
                >
                  {payload.number.replace(/(.{4})/g, '$1 ').trim()}
                </span>
              )}
              {payload.expiry && (
                <span style={s.chip}>Exp: {payload.expiry}</span>
              )}
              {payload.cvv && <span style={s.chip}>CVV: {payload.cvv}</span>}
            </div>
            {/* Copy buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {payload.number && (
                <button
                  style={{ ...s.btn, flex: 1 }}
                  onClick={() => copy(payload.number!, 'num')}
                >
                  {copied === 'num' ? '✓ Copied' : 'Copy Number'}
                </button>
              )}
              {payload.cvv && (
                <button
                  style={{ ...s.btn, flex: 1 }}
                  onClick={() => copy(payload.cvv!, 'cvv')}
                >
                  {copied === 'cvv' ? '✓ Copied' : 'Copy CVV'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

const s: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 10,
    background: '#0f172a',
    border: '1px solid #1e293b',
  },
  iconBox: {
    fontSize: 18,
    flexShrink: 0,
    width: 34,
    height: 34,
    borderRadius: 8,
    background: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { overflow: 'hidden', minWidth: 0 },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: '#f1f5f9',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    margin: 0,
  },
  meta: {
    fontSize: 11,
    color: '#64748b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    margin: '2px 0 0',
  },
  actions: { display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' },
  btn: {
    padding: '5px 9px',
    borderRadius: 6,
    border: 'none',
    background: '#1e293b',
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  blue: { background: '#1e3a5f', color: '#38bdf8' },
  danger: { background: '#1e293b', color: '#475569' },
  chip: {
    fontSize: 12,
    color: '#94a3b8',
    background: '#1e293b',
    padding: '4px 8px',
    borderRadius: 6,
  },
};
