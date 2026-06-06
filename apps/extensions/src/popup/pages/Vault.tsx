import { useEffect, useRef, useState } from 'react';
import { MSG } from '../../lib/messages';
import type { GetVaultItemsResponse } from '../../lib/messages';
import type { DecryptedItem } from '../../types';
import VaultItem from '../components/VaultItem';

interface Props {
  onLogout: () => void;
}

type Filter = 'all' | 'login' | 'note' | 'card';

export default function Vault({ onLogout }: Props) {
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    const res = await chrome.runtime.sendMessage<object, GetVaultItemsResponse>(
      {
        type: MSG.GET_VAULT_ITEMS,
      }
    );
    setLoading(false);
    if (res.success && res.items) {
      // Deduplicate by ID — handles React strict mode double-invoke
      const seen = new Set<string>();
      const unique = res.items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      setItems(unique);
    } else {
      setError(res.error ?? 'Failed to load vault');
    }
  }

  async function handleLogout() {
    await chrome.runtime.sendMessage({ type: MSG.LOGOUT });
    onLogout();
  }

  const counts = {
    all: items.length,
    login: items.filter((i) => i.type === 'login').length,
    note: items.filter((i) => i.type === 'note').length,
    card: items.filter((i) => i.type === 'card').length,
  };

  const filtered = items.filter((item) => {
    const matchFilter = filter === 'all' || item.type === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      item.payload.title.toLowerCase().includes(q) ||
      item.payload.username?.toLowerCase().includes(q) ||
      item.payload.url?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  return (
    <div style={s.page}>
      {/* Topbar */}
      <div style={s.topbar}>
        <div style={s.logo}>
          🔐 <span style={s.logoText}>VaultX</span>
        </div>
        <div style={s.topRight}>
          <button style={s.refreshBtn} onClick={loadItems} title="Refresh">
            ↻
          </button>
          <button style={s.lockBtn} onClick={handleLogout}>
            Lock
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={s.searchWrap}>
        <span style={s.searchIcon}>⌕</span>
        <input
          style={s.search}
          placeholder="Search vault..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button style={s.clearBtn} onClick={() => setSearch('')}>
            ✕
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={s.tabs}>
        {(['all', 'login', 'note', 'card'] as Filter[]).map((f) => (
          <button
            key={f}
            style={{ ...s.tab, ...(filter === f ? s.tabActive : {}) }}
            onClick={() => setFilter(f)}
          >
            {f === 'all'
              ? '🔒'
              : f === 'login'
                ? '🔑'
                : f === 'note'
                  ? '📝'
                  : '💳'}{' '}
            {f} {counts[f] > 0 && <span style={s.badge}>{counts[f]}</span>}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div style={s.list}>
        {loading && <p style={s.center}>Decrypting vault...</p>}
        {error && <p style={s.errText}>{error}</p>}
        {!loading && filtered.length === 0 && !error && (
          <div style={s.empty}>
            <p style={{ fontSize: 28 }}>🔍</p>
            <p>{search ? 'No results found' : 'No items yet'}</p>
            <p style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
              Add items from the web app
            </p>
          </div>
        )}
        {filtered.map((item) => (
          <VaultItem
            key={item.id}
            item={item}
            onDeleted={(id) =>
              setItems((prev) => prev.filter((i) => i.id !== id))
            }
          />
        ))}
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <span>
          {counts.all} item{counts.all !== 1 ? 's' : ''}
        </span>
        <span style={{ color: '#10b981' }}>● Encrypted</span>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: 600,
    background: '#0f172a',
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid #1e293b',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 },
  logoText: { fontWeight: 800, color: '#10b981', fontSize: 18 },
  topRight: { display: 'flex', gap: 6, alignItems: 'center' },
  refreshBtn: {
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: 'transparent',
    color: '#64748b',
    fontSize: 16,
    cursor: 'pointer',
  },
  lockBtn: {
    padding: '5px 14px',
    borderRadius: 6,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  searchWrap: {
    position: 'relative',
    margin: '12px 16px 0',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    color: '#475569',
    fontSize: 18,
  },
  search: {
    width: '100%',
    padding: '9px 36px',
    borderRadius: 8,
    border: '1px solid #1e293b',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: 13,
    outline: 'none',
  },
  clearBtn: {
    position: 'absolute',
    right: 10,
    background: 'none',
    border: 'none',
    color: '#475569',
    cursor: 'pointer',
    fontSize: 13,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    padding: '10px 16px',
    borderBottom: '1px solid #1e293b',
  },
  tab: {
    flex: 1,
    padding: '6px 4px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabActive: { background: '#1e293b', color: '#10b981', fontWeight: 600 },
  badge: {
    background: '#10b981',
    color: '#000',
    borderRadius: 10,
    padding: '0 5px',
    fontSize: 10,
    fontWeight: 700,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  center: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 13,
    margin: 'auto',
  },
  errText: { color: '#f87171', fontSize: 12, textAlign: 'center' },
  empty: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 13,
    margin: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderTop: '1px solid #1e293b',
    fontSize: 11,
    color: '#475569',
  },
};
