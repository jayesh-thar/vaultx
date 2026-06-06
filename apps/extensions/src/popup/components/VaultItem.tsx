import { useState } from 'react';
import type { DecryptedItem } from '../../types';

interface Props {
  item: DecryptedItem;
}

const TYPE_ICON: Record<string, string> = {
  login: '🔑',
  note: '📝',
  card: '💳',
};

export default function VaultItem({ item }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

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

  const { payload } = item;
  const domain = payload.url
    ? (() => {
        try {
          return new URL(
            payload.url.startsWith('http')
              ? payload.url
              : 'https://' + payload.url
          ).hostname;
        } catch {
          return payload.url;
        }
      })()
    : null;

  return (
    <div style={s.card}>
      <div style={s.left}>
        <div style={s.iconBox}>{TYPE_ICON[item.type] ?? '🔒'}</div>
        <div style={s.info}>
          <p style={s.title}>{payload.title}</p>
          <p style={s.meta}>{payload.username || domain || item.type}</p>
        </div>
      </div>
      <div style={s.actions}>
        {payload.username && (
          <button style={s.btn} onClick={() => copy(payload.username!, 'user')}>
            {copied === 'user' ? '✓' : 'User'}
          </button>
        )}
        {payload.password && (
          <button style={s.btn} onClick={() => copy(payload.password!, 'pass')}>
            {copied === 'pass' ? '✓' : 'Pass'}
          </button>
        )}
        {payload.url && (
          <button style={{ ...s.btn, ...s.openBtn }} onClick={openUrl}>
            ↗
          </button>
        )}
      </div>
    </div>
  );
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
    fontSize: 20,
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: 8,
    background: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { overflow: 'hidden' },
  title: {
    fontSize: 14,
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
    padding: '5px 10px',
    borderRadius: 6,
    border: 'none',
    background: '#1e293b',
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
    minWidth: 40,
  },
  openBtn: { background: '#1e3a5f', color: '#38bdf8' },
};
