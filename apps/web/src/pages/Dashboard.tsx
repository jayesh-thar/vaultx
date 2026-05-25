import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { encrypt, decrypt } from '../lib/crypto';
import { useVaultStore } from '../store/useVaultStore';
import type { VaultItem } from '../store/useVaultStore';
import { loadSession, clearStoredSession } from '../lib/storage';
import { useWindowSize } from '../hooks/useWindowSize';
import Sidebar from '../components/Sidebar';
import VaultItemCard from '../components/VaultItemCard';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface CustomField {
  id: string;
  label: string;
  value: string;
  type: 'text' | 'password' | 'url' | 'email';
}

export interface ItemPayload {
  title: string;
  // Login
  username?: string;
  password?: string;
  url?: string;
  // Note
  content?: string;
  // Card
  cardholder?: string;
  number?: string;
  expiry?: string;
  cvv?: string;
  // Shared
  notes?: string;
  favorite?: boolean;
  customFields?: CustomField[];
  passwordChangedAt?: string; // ISO date string — for age tracking
}

export interface DecryptedVaultItem {
  id: string;
  type: 'login' | 'note' | 'card';
  category: string | null;
  created_at: string;
  payload: ItemPayload;
}

type ItemType = 'login' | 'note' | 'card';

interface FormState {
  type: ItemType;
  title: string;
  username: string;
  password: string;
  url: string;
  content: string;
  cardholder: string;
  number: string;
  expiry: string;
  cvv: string;
  notes: string;
  category: string;
  favorite: boolean;
  customFields: CustomField[];
}

const EMPTY_FORM: FormState = {
  type: 'login',
  title: '',
  username: '',
  password: '',
  url: '',
  content: '',
  cardholder: '',
  number: '',
  expiry: '',
  cvv: '',
  notes: '',
  category: '',
  favorite: false,
  customFields: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generatePassword(length = 20): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => charset[b % charset.length])
    .join('');
}

function buildPayload(form: FormState): ItemPayload {
  const base = {
    favorite: form.favorite,
    customFields: form.customFields.length > 0 ? form.customFields : undefined,
  };
  if (form.type === 'login') {
    return {
      ...base,
      title: form.title,
      username: form.username,
      password: form.password,
      url: form.url,
      notes: form.notes || undefined,
      // Track when password was set/changed
      passwordChangedAt: isNewPassword ? new Date().toISOString() : undefined,
    };
  }
  if (form.type === 'note') {
    return {
      title: form.title,
      content: form.content,
      notes: form.notes || undefined,
      ...base,
    };
  }
  if (form.type === 'card') {
    return {
      title: form.title,
      cardholder: form.cardholder,
      number: form.number,
      expiry: form.expiry,
      cvv: form.cvv,
      notes: form.notes || undefined,
      ...base,
    };
  }
  return {
    title: form.title,
    username: form.username,
    password: form.password,
    url: form.url,
    notes: form.notes || undefined,
    ...base,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { vaultKey, clearSession } = useVaultStore();
  const { isMobile } = useWindowSize();
  const session = loadSession();

  const [displayName, setDisplayName] = useState(
    session?.email?.split('@')[0] ?? 'User'
  );
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // useEffect after existing useEffect:
  useEffect(() => {
    api
      .get('/api/user/profile')
      .then(({ data }) => {
        if (data.display_name) setDisplayName(data.display_name);
        if (data.profile_photo) setProfilePhoto(data.profile_photo);
      })
      .catch(() => {});
  }, []); // runs once on mount — re-runs when Dashboard remounts after /settings

  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeType, setActiveType] = useState('all');
  const [activeCategory, setActiveCategory] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Fetch ──────────────────────────────────────────────────────────────────

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
            const payload = JSON.parse(plaintext) as ItemPayload;
            return {
              id: item.id,
              type: (item.type as ItemType) ?? 'login',
              category: item.category ?? null,
              created_at: item.created_at,
              payload,
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

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = items.filter((item) => {
    if (activeType === 'favorites') return !!item.payload.favorite;
    if (activeType !== 'all' && item.type !== activeType) return false;
    if (activeCategory !== 'All' && item.category !== activeCategory)
      return false;
    const q = search.toLowerCase();
    return (
      item.payload.title.toLowerCase().includes(q) ||
      (item.payload.username ?? '').toLowerCase().includes(q) ||
      (item.category ?? '').toLowerCase().includes(q)
    );
  });

  // ── Modal ──────────────────────────────────────────────────────────────────

  function openAdd() {
    setForm({
      ...EMPTY_FORM,
      type:
        activeType === 'note'
          ? 'note'
          : activeType === 'card'
            ? 'card'
            : 'login',
    });
    setEditingId(null);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(item: DecryptedVaultItem) {
    setForm({
      type: item.type,
      title: item.payload.title ?? '',
      username: item.payload.username ?? '',
      password: item.payload.password ?? '',
      url: item.payload.url ?? '',
      content: item.payload.content ?? '',
      cardholder: item.payload.cardholder ?? '',
      number: item.payload.number ?? '',
      expiry: item.payload.expiry ?? '',
      cvv: item.payload.cvv ?? '',
      notes: item.payload.notes ?? '',
      category: item.category ?? '',
      favorite: item.payload.favorite ?? false,
      customFields: item.payload.customFields ?? [],
    });
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

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.title.trim()) return setFormError('Title is required.');
    if (form.type === 'login' && !form.password.trim())
      return setFormError('Password is required.');
    if (!vaultKey) return;

    setSaving(true);
    setFormError('');
    try {
      const payloadData = buildPayload(form);
      const { ciphertext: encryptedData, iv } = await encrypt(
        JSON.stringify(payloadData),
        vaultKey
      );
      const body = {
        type: form.type,
        encryptedData,
        iv,
        category: form.category.trim() || undefined,
      };

      if (editingId) {
        await api.put(`/api/vault/items/${editingId}`, body);
      } else {
        await api.post('/api/vault/items', body);
      }
      closeModal();
      await fetchItems();
    } catch {
      setFormError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Favorite Toggle ────────────────────────────────────────────────────────

  async function handleToggleFavorite(item: DecryptedVaultItem) {
    if (!vaultKey) return;
    try {
      const updatedPayload = {
        ...item.payload,
        favorite: !item.payload.favorite,
      };
      const { ciphertext: encryptedData, iv } = await encrypt(
        JSON.stringify(updatedPayload),
        vaultKey
      );
      await api.put(`/api/vault/items/${item.id}`, {
        type: item.type,
        encryptedData,
        iv,
        category: item.category ?? undefined,
      });
      await fetchItems();
    } catch {
      setPageError('Failed to update favorite.');
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/vault/items/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setPageError('Failed to delete item.');
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async function handleLogout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ok */
    }
    clearSession();
    clearStoredSession();
    navigate('/login');
  }

  function handleLockVault() {
    clearSession(); // clears Zustand state (vaultKey + token)
    // localStorage session stays → ProtectedRoute redirects to /unlock
    navigate('/unlock');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex"
      style={{
        minHeight: '100vh',
        alignItems: 'stretch',
        background: 'var(--bg-base)',
      }}
    >
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        isMobile={isMobile}
        onClose={() => setSidebarOpen(false)}
        items={items}
        activeType={activeType}
        activeCategory={activeCategory}
        onTypeChange={setActiveType}
        onCategoryChange={setActiveCategory}
        email={session?.email ?? ''}
        onLogout={handleLogout}
        onLockVault={handleLockVault}
        displayName={displayName}
        profilePhoto={profilePhoto}
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        {isMobile && (
          <header
            className="flex items-center gap-3 px-4 py-3"
            style={{
              borderBottom: '0.5px solid var(--border)',
              background: 'var(--bg-surface)',
            }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="flex flex-col gap-1.5 p-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <span
                className="block w-5 h-0.5 rounded"
                style={{ background: 'currentColor' }}
              />
              <span
                className="block w-5 h-0.5 rounded"
                style={{ background: 'currentColor' }}
              />
              <span
                className="block w-5 h-0.5 rounded"
                style={{ background: 'currentColor' }}
              />
            </button>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              VaultX
            </span>
          </header>
        )}

        <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-6">
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
                className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none vx-input"
                style={{
                  background: 'var(--bg-surface)',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium flex-shrink-0 vx-btn-accent"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              + Add item
            </button>
          </div>

          {pageError && (
            <div
              className="rounded-lg px-4 py-3 mb-5 text-sm"
              style={{ background: '#2A0000', color: 'var(--danger)' }}
            >
              {pageError}
            </div>
          )}

          {/* Content */}
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
                {search
                  ? 'No items match your search'
                  : activeType === 'favorites'
                    ? 'No favorites yet'
                    : activeType === 'login'
                      ? 'No logins saved yet'
                      : activeType === 'note'
                        ? 'No secure notes yet'
                        : activeType === 'card'
                          ? 'No cards saved yet'
                          : 'Your vault is empty'}
              </p>
              {!search && activeType !== 'favorites' && (
                <button
                  onClick={openAdd}
                  className="text-sm"
                  style={{ color: 'var(--accent)' }}
                >
                  {activeType === 'login'
                    ? 'Save your first login →'
                    : activeType === 'note'
                      ? 'Create your first note →'
                      : activeType === 'card'
                        ? 'Add your first card →'
                        : 'Add your first item →'}
                </button>
              )}
              {!search && activeType === 'favorites' && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Star any item to see it here
                </p>
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
                  onToggleFavorite={() => handleToggleFavorite(item)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4 z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
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
                className="flex-1 rounded-lg py-2.5 text-sm flex-shrink-0 font-medium vx-btn-ghost"
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
              {/* Type selector */}
              {!editingId && (
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Type
                  </label>
                  <div className="flex gap-2">
                    {(['login', 'note', 'card'] as ItemType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...EMPTY_FORM,
                            type: t,
                            category: f.category,
                          }))
                        }
                        className="flex-1 py-2 rounded-lg text-xs font-medium capitalize"
                        style={{
                          background:
                            form.type === t
                              ? 'var(--accent)'
                              : 'var(--bg-elevated)',
                          color:
                            form.type === t ? '#fff' : 'var(--text-secondary)',
                          border:
                            form.type === t
                              ? 'none'
                              : '0.5px solid var(--border)',
                        }}
                      >
                        {t === 'login'
                          ? 'Login'
                          : t === 'note'
                            ? 'Secure Note'
                            : 'Credit Card'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title — always */}
              <FormField
                label="Title *"
                value={form.title}
                onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                placeholder={
                  form.type === 'login'
                    ? 'e.g. GitHub'
                    : form.type === 'note'
                      ? 'Note title'
                      : 'e.g. Visa Card'
                }
              />

              {/* LOGIN fields */}
              {form.type === 'login' && (
                <>
                  <FormField
                    label="Username / Email"
                    value={form.username}
                    onChange={(v) => setForm((f) => ({ ...f, username: v }))}
                    placeholder="you@example.com"
                  />
                  <div>
                    <label
                      className="block text-xs font-medium mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Password *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.password}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, password: e.target.value }))
                        }
                        placeholder="Password"
                        className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono vx-input"
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '0.5px solid var(--border)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            password: generatePassword(),
                          }))
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
                  <FormField
                    label="URL"
                    value={form.url}
                    onChange={(v) => setForm((f) => ({ ...f, url: v }))}
                    placeholder="https://github.com"
                  />
                </>
              )}

              {/* NOTE fields */}
              {form.type === 'note' && (
                <div>
                  <label
                    className="block text-xs font-medium mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Content
                  </label>
                  <textarea
                    value={form.content}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, content: e.target.value }))
                    }
                    placeholder="Your secure note content..."
                    rows={5}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '0.5px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              {/* CARD fields */}
              {form.type === 'card' && (
                <>
                  <FormField
                    label="Cardholder Name"
                    value={form.cardholder}
                    onChange={(v) => setForm((f) => ({ ...f, cardholder: v }))}
                    placeholder="John Smith"
                  />
                  <FormField
                    label="Card Number"
                    value={form.number}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        number: v.replace(/\D/g, '').slice(0, 16),
                      }))
                    }
                    placeholder="1234 5678 9012 3456"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <FormField
                        label="Expiry"
                        value={form.expiry}
                        onChange={(v) => setForm((f) => ({ ...f, expiry: v }))}
                        placeholder="MM/YY"
                      />
                    </div>
                    <div style={{ width: 100 }}>
                      <FormField
                        label="CVV"
                        value={form.cvv}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            cvv: v.replace(/\D/g, '').slice(0, 4),
                          }))
                        }
                        placeholder="123"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Shared */}
              <FormField
                label="Category"
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                placeholder="e.g. Work, Social"
              />
              <FormField
                label="Notes"
                value={form.notes}
                onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="Optional notes"
              />

              {/* Favorite toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() =>
                    setForm((f) => ({ ...f, favorite: !f.favorite }))
                  }
                  className="w-8 h-4 rounded-full transition-colors relative cursor-pointer"
                  style={{
                    background: form.favorite
                      ? 'var(--accent)'
                      : 'var(--border)',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full transition-transform"
                    style={{
                      background: '#fff',
                      left: form.favorite ? 'calc(100% - 14px)' : '2px',
                    }}
                  />
                </div>
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Mark as favorite
                </span>
              </label>

              {/* Custom Fields */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Custom Fields
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        customFields: [
                          ...f.customFields,
                          {
                            id: crypto.randomUUID(),
                            label: '',
                            value: '',
                            type: 'text',
                          },
                        ],
                      }))
                    }
                    className="text-xs px-2 py-1 rounded-lg vx-btn-ghost"
                    style={{
                      color: 'var(--accent)',
                      border: '0.5px solid var(--accent)',
                    }}
                  >
                    + Add field
                  </button>
                </div>

                {form.customFields.map((field, i) => (
                  <div key={field.id} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customFields: f.customFields.map((cf, j) =>
                            j === i ? { ...cf, label: e.target.value } : cf
                          ),
                        }))
                      }
                      placeholder="Field name"
                      className="rounded-lg px-2 py-1.5 text-xs outline-none vx-input"
                      style={{
                        width: 120,
                        background: 'var(--bg-elevated)',
                        border: '0.5px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={field.value}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customFields: f.customFields.map((cf, j) =>
                            j === i ? { ...cf, value: e.target.value } : cf
                          ),
                        }))
                      }
                      placeholder="Value"
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none vx-input"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '0.5px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customFields: f.customFields.map((cf, j) =>
                            j === i
                              ? {
                                  ...cf,
                                  type: e.target.value as CustomField['type'],
                                }
                              : cf
                          ),
                        }))
                      }
                      className="rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '0.5px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <option value="text">Text</option>
                      <option value="password">Password</option>
                      <option value="url">URL</option>
                      <option value="email">Email</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          customFields: f.customFields.filter(
                            (_, j) => j !== i
                          ),
                        }))
                      }
                      aria-label="Remove field"
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 vx-btn"
                      style={{
                        color: 'var(--danger)',
                        background: 'var(--bg-elevated)',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium flex-shrink-0"
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
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium vx-btn-accent"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Save item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small reusable form field ────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none vx-input"
        style={{
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}
