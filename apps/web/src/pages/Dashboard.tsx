import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { encrypt, decrypt } from '../lib/crypto';
import { useVaultStore } from '../store/useVaultStore';
import type { VaultItem } from '../store/useVaultStore';
import { loadSession, clearStoredSession } from '../lib/storage';
import VaultItemCard from '../components/VaultItemCard';

export interface ItemPayload {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

export interface DecryptedVaultItem {
  id: string;
  category: string | null;
  created_at: string;
  payload: ItemPayload;
}

interface FormState {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  username: '',
  password: '',
  url: '',
  notes: '',
  category: '',
};

function generatePassword(length = 20): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => charset[b % charset.length])
    .join('');
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { vaultKey, clearSession } = useVaultStore();
  const session = loadSession();

  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchItems = useCallback(async () => {
    if (!vaultKey) return;
    try {
      const { data } = await api.get('/api/vault/items');
      const rawItems: VaultItem[] = Array.isArray(data)
        ? data
        : (data.items ?? data.data ?? []);

      const decrypted = await Promise.all(
        rawItems.map(async (item): Promise<DecryptedVaultItem | null> => {
          try {
            const plaintext = await decrypt(
              { ciphertext: item.encrypted_data, iv: item.iv },
              vaultKey
            );
            return {
              id: item.id,
              category: item.category ?? null,
              created_at: item.created_at,
              payload: JSON.parse(plaintext) as ItemPayload,
            };
          } catch {
            return null;
          }
        })
      );

      setItems(decrypted.filter(Boolean) as DecryptedVaultItem[]);
    } catch (err) {
      console.error('fetchItems error:', err);
      setPageError('Failed to load vault items.');
    } finally {
      setLoading(false);
    }
  }, [vaultKey]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  // Unique categories from items
  const categories = [
    'All',
    ...Array.from(
      new Set(items.filter((i) => i.category).map((i) => i.category!))
    ),
  ];

  const filtered = items.filter((item) => {
    const catMatch =
      activeCategory === 'All' || item.category === activeCategory;
    const searchMatch =
      item.payload.title.toLowerCase().includes(search.toLowerCase()) ||
      item.payload.username.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(item: DecryptedVaultItem) {
    setForm({ ...item.payload, category: item.category ?? '' });
    setEditingId(item.id);
    setFormError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function handleSave() {
    if (!form.title.trim()) return setFormError('Title is required.');
    if (!form.password.trim()) return setFormError('Password is required.');
    if (!vaultKey) return;

    setSaving(true);
    setFormError('');
    try {
      const { ciphertext: encryptedData, iv } = await encrypt(
        JSON.stringify({
          title: form.title,
          username: form.username,
          password: form.password,
          url: form.url,
          notes: form.notes,
        }),
        vaultKey
      );
      const payload = {
        type: 'login' as const,
        encryptedData,
        iv,
        category: form.category.trim() || undefined,
      };

      if (editingId) {
        await api.put(`/api/vault/items/${editingId}`, payload);
      } else {
        await api.post('/api/vault/items', payload);
      }
      closeModal();
      await fetchItems();
    } catch {
      setFormError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/vault/items/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setPageError('Failed to delete item.');
    }
  }

  async function handleLogout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* logout anyway */
    }
    clearSession();
    clearStoredSession();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col"
        style={{
          width: 240,
          minHeight: '100vh',
          background: 'var(--bg-surface)',
          borderRight: '0.5px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-2.5 px-5 py-5"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ background: 'var(--accent-subtle)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="11"
                width="18"
                height="11"
                rx="2"
                stroke="#10B981"
                strokeWidth="2"
              />
              <path
                d="M7 11V7a5 5 0 0110 0v4"
                stroke="#10B981"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            VaultX
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          <p
            className="text-xs font-medium px-2 mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}
          >
            VAULT
          </p>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="w-full text-left text-sm px-3 py-2 rounded-lg flex items-center justify-between"
              style={{
                background:
                  activeCategory === cat
                    ? 'var(--accent-subtle)'
                    : 'transparent',
                color:
                  activeCategory === cat
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
              }}
            >
              <span>{cat}</span>
              {cat === 'All' && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {items.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Profile + Logout */}
        <div
          className="px-3 py-4"
          style={{ borderTop: '0.5px solid var(--border)' }}
        >
          <div
            className="px-3 py-2 rounded-lg mb-2"
            style={{ background: 'var(--bg-elevated)' }}
          >
            <p
              className="text-xs font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {session?.email?.split('@')[0] ?? 'User'}
            </p>
            <p
              className="text-xs truncate mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              {session?.email ?? ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-sm px-3 py-2 rounded-lg text-left"
            style={{ color: 'var(--danger)' }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-8 py-8">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="8"
                  stroke="var(--text-muted)"
                  strokeWidth="2"
                />
                <path
                  d="M21 21l-4.35-4.35"
                  stroke="var(--text-muted)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none"
                style={{
                  background: 'var(--bg-surface)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              + Add item
            </button>
          </div>

          {pageError && (
            <div
              className="rounded-lg px-4 py-3 mb-6 text-sm"
              style={{ background: '#2A0000', color: 'var(--danger)' }}
            >
              {pageError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Loading vault...
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--bg-surface)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="11"
                    width="18"
                    height="11"
                    rx="2"
                    stroke="var(--text-muted)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M7 11V7a5 5 0 0110 0v4"
                    stroke="var(--text-muted)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {search ? 'No items match your search' : 'Your vault is empty'}
              </p>
              {!search && (
                <button
                  onClick={openAdd}
                  className="text-sm"
                  style={{ color: 'var(--accent)' }}
                >
                  Add your first item →
                </button>
              )}
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              }}
            >
              {filtered.map((item) => (
                <VaultItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4 z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: 'var(--bg-surface)',
              border: '0.5px solid var(--border)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {editingId ? 'Edit item' : 'Add new item'}
              </h2>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                className="rounded-lg px-3 py-2 mb-4 text-sm"
                style={{ background: '#2A0000', color: 'var(--danger)' }}
              >
                {formError}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {/* Title */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Title <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="e.g. GitHub"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Username */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Username / Email
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, username: e.target.value }))
                  }
                  placeholder="you@example.com"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Password <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    placeholder="Password"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '0.5px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, password: generatePassword() }))
                    }
                    className="px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
                    style={{
                      background: 'var(--accent-subtle)',
                      color: 'var(--accent)',
                      border: '0.5px solid var(--accent)',
                    }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              {/* URL */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  URL
                </label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, url: e.target.value }))
                  }
                  placeholder="https://github.com"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Category */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Category
                </label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="e.g. Work, Social"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Notes */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Notes
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Optional notes"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="flex gap-2 mt-1">
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    opacity: saving ? 0.7 : 1,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving
                    ? 'Saving...'
                    : editingId
                      ? 'Update item'
                      : 'Save item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
