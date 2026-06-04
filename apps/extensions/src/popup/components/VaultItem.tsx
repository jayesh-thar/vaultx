import { useState } from 'react';
import type { DecryptedItem } from '../../types';

interface Props {
  item: DecryptedItem;
}

export default function VaultItem({ item }: Props) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copy(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  const { payload } = item;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.icon}>
          {item.type === 'login' ? '🔑' : item.type === 'note' ? '📝' : '💳'}
        </span>
        <div style={styles.titleBlock}>
          <p style={styles.title}>{payload.title}</p>
          {payload.username && (
            <p style={styles.username}>{payload.username}</p>
          )}
        </div>
      </div>

      <div style={styles.actions}>
        {payload.username && (
          <button
            style={styles.copyBtn}
            onClick={() => copy(payload.username!, 'username')}
          >
            {copiedField === 'username' ? '✓ Copied' : 'Copy User'}
          </button>
        )}
        {payload.password && (
          <button
            style={styles.copyBtn}
            onClick={() => copy(payload.password!, 'password')}
          >
            {copiedField === 'password' ? '✓ Copied' : 'Copy Pass'}
          </button>
        )}
        {payload.url && (
          <button
            style={{ ...styles.copyBtn, background: '#1d4ed8' }}
            onClick={() => chrome.tabs.create({ url: payload.url! })}
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#1f2937',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: '1px solid #374151',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 20,
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflow: 'hidden',
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: '#f9fafb',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  username: {
    margin: 0,
    fontSize: 12,
    color: '#9ca3af',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  actions: {
    display: 'flex',
    gap: 6,
  },
  copyBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    background: '#374151',
    color: '#f9fafb',
    fontSize: 12,
    cursor: 'pointer',
  },
};
