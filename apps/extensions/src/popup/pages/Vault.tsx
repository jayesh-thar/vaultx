import { useEffect, useState } from 'react';
import { MSG } from '../../lib/messages';
import type { GetVaultItemsResponse } from '../../lib/messages';
import type { DecryptedItem } from '../../types';
import VaultItem from '../components/VaultItem';

interface Props {
  onLogout: () => void;
}

export default function Vault({ onLogout }: Props) {
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [filtered, setFiltered] = useState<DecryptedItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      items.filter(
        (item) =>
          item.payload.title.toLowerCase().includes(q) ||
          item.payload.username?.toLowerCase().includes(q) ||
          item.payload.url?.toLowerCase().includes(q)
      )
    );
  }, [search, items]);

  async function loadItems() {
    setLoading(true);
    const res = await chrome.runtime.sendMessage<object, GetVaultItemsResponse>(
      {
        type: MSG.GET_VAULT_ITEMS,
      }
    );
    setLoading(false);
    if (res.success && res.items) {
      setItems(res.items);
      setFiltered(res.items);
    } else {
      setError(res.error ?? 'Failed to load vault');
    }
  }

  async function handleLogout() {
    await chrome.runtime.sendMessage({ type: MSG.LOGOUT });
    onLogout();
  }

  return (
    <div style={styles.container}>
      <div style={styles.topbar}>
        <span style={styles.logoText}>🔐 VaultX</span>
        <button style={styles.logoutBtn} onClick={handleLogout}>
          Lock
        </button>
      </div>

      <input
        style={styles.search}
        type="text"
        placeholder="Search vault..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && <p style={styles.center}>Decrypting vault...</p>}
      {error && <p style={styles.errorText}>{error}</p>}

      {!loading && filtered.length === 0 && !error && (
        <p style={styles.center}>
          {search ? 'No results found' : 'No items in vault'}
        </p>
      )}

      <div style={styles.list}>
        {filtered.map((item) => (
          <VaultItem key={item.id} item={item} />
        ))}
      </div>

      <p style={styles.count}>
        {items.length} item{items.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 16,
    fontWeight: 700,
    color: '#10b981',
  },
  logoutBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #374151',
    background: 'transparent',
    color: '#9ca3af',
    fontSize: 12,
    cursor: 'pointer',
  },
  search: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #374151',
    background: '#1f2937',
    color: '#f9fafb',
    fontSize: 13,
    outline: 'none',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 320,
    overflowY: 'auto',
  },
  center: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 13,
    margin: '20px 0',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    textAlign: 'center',
  },
  count: {
    textAlign: 'center',
    fontSize: 11,
    color: '#4b5563',
    margin: 0,
  },
};
