import { useEffect, useState } from 'react';
import type { DecryptedItem } from '../../types';
import CardPinGate from './CardPinGate';

interface Props {
  item: DecryptedItem;
  onDeleted?: (id: string) => void; // parent removes item from list
}

const TYPE_ICON: Record<string, string> = {
  login: '🔑',
  note: '📝',
  card: '💳',
};

const PIN_DURATION = 5 * 60 * 1000;

async function getPinSessionValid(): Promise<boolean> {
  const r = await chrome.storage.session.get('cardPinVerifiedAt');
  const ts = r.cardPinVerifiedAt as number | undefined;
  return !!ts && Date.now() - ts < PIN_DURATION;
}

export default function VaultItem({ item, onDeleted }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cardUnlocked, setCardUnlocked] = useState(false);
  const [showPinGate, setShowPinGate] = useState<'view' | 'delete' | null>(
    null
  );

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
    // Check session first — avoid showing PIN gate if still valid
    const valid = await getPinSessionValid();
    if (valid) {
      setCardUnlocked(true);
      return;
    }
    setShowPinGate('view');
  }

  async function handleDeleteClick() {
    if (item.type === 'card') {
      // Cards always require PIN to delete
      setShowPinGate('delete');
    } else {
      // Non-card items: confirm then delete directly
      if (!confirm(`Delete "${item.payload.title}"?`)) return;
      await deleteItem();
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
      alert('Failed to delete item');
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

  // Auto-relock card after 5 minutes
  useEffect(() => {
    if (!cardUnlocked) return;
    const timer = setTimeout(
      async () => {
        setCardUnlocked(false);
        await chrome.storage.session.remove('cardPinVerifiedAt');
      },
      5 * 60 * 1000
    );
    return () => clearTimeout(timer);
  }, [cardUnlocked]);

  // ── PIN GATE OVERLAY ───────────────────────────────────────────────────────
  if (showPinGate) {
    return (
      <div
        style={{ ...s.card, flexDirection: 'column', alignItems: 'stretch' }}
      >
        <CardPinGate
          action={showPinGate}
          itemTitle={payload.title}
          onSuccess={async () => {
            if (showPinGate === 'view') {
              setCardUnlocked(true);
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

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (item.type === 'login') {
    return (
      <div style={s.card}>
        <div style={s.left}>
          <div style={s.iconBox}>{TYPE_ICON.login}</div>
          <div style={s.info}>
            <p style={s.title}>{payload.title}</p>
            <p style={s.meta}>{payload.username || domain || '—'}</p>
          </div>
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
            <button style={{ ...s.btn, ...s.openBtn }} onClick={openUrl}>
              ↗
            </button>
          )}
          <button
            style={{ ...s.btn, color: '#f87171' }}
            onClick={handleDeleteClick}
          >
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
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          onClick={() => setExpanded((e) => !e)}
        >
          <div style={s.left}>
            <div style={s.iconBox}>{TYPE_ICON.note}</div>
            <div style={s.info}>
              <p style={s.title}>{payload.title}</p>
              <p style={s.meta}>
                Secure note · {expanded ? 'collapse' : 'tap to view'}
              </p>
            </div>
          </div>
          <div style={s.actions}>
            {expanded && payload.content && (
              <button
                style={s.btn}
                onClick={(e) => {
                  e.stopPropagation();
                  copy(payload.content!, 'note');
                }}
              >
                {copied === 'note' ? '✓' : 'Copy'}
              </button>
            )}
            <button
              style={{ ...s.btn, color: '#f87171' }}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick();
              }}
            >
              🗑
            </button>
            <span style={{ color: '#475569', fontSize: 12, paddingRight: 4 }}>
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </div>
        {expanded && (
          <div style={s.noteBody}>
            {payload.content ? (
              <p style={s.noteText}>{payload.content}</p>
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
    if (!cardUnlocked) {
      return (
        <div style={s.card}>
          <div style={s.left}>
            <div style={s.iconBox}>💳</div>
            <div style={s.info}>
              <p style={s.title}>{payload.title}</p>
              <p style={s.meta}>
                {payload.cardholder || 'Payment card'} · PIN protected
              </p>
            </div>
          </div>
          <div style={s.actions}>
            <button
              style={{ ...s.btn, ...s.openBtn }}
              onClick={handleCardViewClick}
            >
              🔓 View
            </button>
            <button
              style={{ ...s.btn, color: '#f87171' }}
              onClick={handleDeleteClick}
            >
              🗑
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          ...s.card,
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={s.left}>
            <div style={s.iconBox}>💳</div>
            <div style={s.info}>
              <p style={s.title}>{payload.title}</p>
              <p style={{ ...s.meta, color: '#10b981' }}>
                Unlocked · PIN required next open
              </p>
            </div>
          </div>
          <div style={s.actions}>
            {payload.number && (
              <button
                style={s.btn}
                onClick={() => copy(payload.number!, 'num')}
              >
                {copied === 'num' ? '✓' : 'Num'}
              </button>
            )}
            {payload.cvv && (
              <button style={s.btn} onClick={() => copy(payload.cvv!, 'cvv')}>
                {copied === 'cvv' ? '✓' : 'CVV'}
              </button>
            )}
            <button
              style={{ ...s.btn, color: '#94a3b8' }}
              onClick={handleCardViewClick}
            >
              🔒
            </button>
            <button
              style={{ ...s.btn, color: '#f87171' }}
              onClick={handleDeleteClick}
            >
              🗑
            </button>
          </div>
        </div>
        <div style={s.cardDetails}>
          {payload.cardholder && (
            <span style={s.cardField}>👤 {payload.cardholder}</span>
          )}
          {payload.number && (
            <span
              style={{
                ...s.cardField,
                fontFamily: 'monospace',
                letterSpacing: 2,
              }}
            >
              {payload.number.replace(/(.{4})/g, '$1 ').trim()}
            </span>
          )}
          {payload.expiry && (
            <span style={s.cardField}>Exp: {payload.expiry}</span>
          )}
          {payload.cvv && <span style={s.cardField}>CVV: {payload.cvv}</span>}
        </div>
      </div>
    );
  }

  return null;
}

const s: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 10,
    background: '#0f172a',
    border: '1px solid #1e293b',
    gap: 10,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    flex: 1,
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
  info: { overflow: 'hidden' },
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
  actions: { display: 'flex', gap: 4, flexShrink: 0 },
  btn: {
    padding: '5px 8px',
    borderRadius: 6,
    border: 'none',
    background: '#1e293b',
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
  },
  openBtn: { background: '#1e3a5f', color: '#38bdf8' },
  noteBody: {
    padding: '10px 12px',
    borderTop: '1px solid #1e293b',
    marginTop: 8,
  },
  noteText: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  cardDetails: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '10px 12px',
    borderTop: '1px solid #1e293b',
    marginTop: 8,
  },
  cardField: {
    fontSize: 12,
    color: '#94a3b8',
    background: '#1e293b',
    padding: '4px 8px',
    borderRadius: 6,
  },
};
