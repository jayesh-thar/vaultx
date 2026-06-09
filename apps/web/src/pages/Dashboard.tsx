import { useEffect, useState, useCallback, useMemo } from 'react';
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

export interface PasswordHistoryEntry {
  password: string;
  changedAt: string; // ISO date
}

export interface ItemPayload {
  title: string;
  // Login
  username?: string;
  password?: string;
  email?: string;
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
  totpSecret?: string; // base32 TOTP secret
  passwordHistory?: PasswordHistoryEntry[]; // last 5 old passwords
  tags?: string[];
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
  email: string;
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
  totpSecret: string;
  originalPassword: string; // (tracks original to detect changes)
  tags: string[];
}

const EMPTY_FORM: FormState = {
  type: 'login',
  title: '',
  username: '',
  email: '',
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
  totpSecret: '',
  originalPassword: '',
  tags: [],
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

function buildPayload(form: FormState, isNewPassword = false): ItemPayload {
  const base = {
    favorite: form.favorite,
    customFields: form.customFields.length > 0 ? form.customFields : undefined,
    tags: form.tags.length > 0 ? form.tags : undefined,
  };
  if (form.type === 'login') {
    return {
      ...base,
      title: form.title,
      username: form.username || undefined,
      email: form.email || undefined,
      password: form.password,
      url: form.url,
      notes: form.notes || undefined,
      // Track when password was set/changed
      passwordChangedAt: isNewPassword ? new Date().toISOString() : undefined,
      totpSecret: form.totpSecret || undefined,
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

function groupByCategory(items: DecryptedVaultItem[]) {
  const groups = new Map<string, DecryptedVaultItem[]>();
  for (const item of items) {
    const cat = item.category?.trim() || 'Uncategorized';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function getPasswordStrengthBars(p: string): number {
  if (p.length < 8) return 1;
  let s = 0;
  if (/[A-Z]/.test(p)) s++;
  if (/[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length < 12) return Math.min(s, 2);
  return s <= 1 ? 2 : s === 2 ? 3 : 4;
}

function VaultHealthBanner({
  items,
  onDetails,
}: {
  items: DecryptedVaultItem[];
  onDetails: () => void;
}) {
  const loginItems = items.filter(
    (i) => i.type === 'login' && i.payload.password
  );
  if (loginItems.length === 0) return null;

  const passMap = new Map<string, number>();
  loginItems.forEach((i) => {
    const p = i.payload.password!;
    passMap.set(p, (passMap.get(p) ?? 0) + 1);
  });
  const weakCount = loginItems.filter(
    (i) => getPasswordStrengthBars(i.payload.password!) <= 2
  ).length;
  const reusedCount = loginItems.filter(
    (i) => (passMap.get(i.payload.password!) ?? 1) > 1
  ).length;
  if (weakCount === 0 && reusedCount === 0) return null;

  const issues = [
    weakCount > 0 && `${weakCount} weak`,
    reusedCount > 0 && `${reusedCount} reused`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-4"
      style={{
        background: 'rgba(239,68,68,0.07)',
        border: '0.5px solid rgba(239,68,68,0.25)',
      }}
    >
      <span>⚠️</span>
      <div className="flex-1">
        <p className="text-xs font-medium" style={{ color: '#EF4444' }}>
          Password issues detected
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {issues}
        </p>
      </div>
      <button
        onClick={onDetails}
        className="text-xs font-medium vx-btn"
        style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}
      >
        Check health →
      </button>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { vaultKey, clearSession } = useVaultStore();
  const { isMobile } = useWindowSize();
  const session = loadSession();

  const [displayName, setDisplayName] = useState(
    session?.email?.split('@')[0] ?? 'User'
  );
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  const [shareModalItem, setShareModalItem] =
    useState<DecryptedVaultItem | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [shareExpiry, setShareExpiry] = useState(24);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

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

  useEffect(() => {
    // Auto-lock after 15 min of inactivity
    let timeout: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(
        () => {
          clearSession();
          navigate('/unlock');
        },
        15 * 60 * 1000
      );
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timeout);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, []);

  // Ctrl+K / Cmd+K → focus search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('vault-search')?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeType, setActiveType] = useState('all');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeTag, setActiveTag] = useState('');

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

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Re-fetch when tab becomes active again
        void fetchItems();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchItems]);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const displayedItems = useMemo(() => {
    return items.filter((item) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !item.payload.title.toLowerCase().includes(q) &&
          !item.payload.username?.toLowerCase().includes(q) &&
          !item.payload.url?.toLowerCase().includes(q) &&
          !item.category?.toLowerCase().includes(q)
        )
          return false;
      }
      if (activeCategory) return (item.category ?? '') === activeCategory;
      if (activeTag) return (item.payload.tags ?? []).includes(activeTag); // ← ADD
      if (activeType === 'favorites') return item.payload.favorite === true;
      if (activeType === 'login') return item.type === 'login';
      if (activeType === 'note') return item.type === 'note';
      if (activeType === 'card') return item.type === 'card';
      return true;
    });
  }, [items, search, activeType, activeCategory, activeTag]);

  function handleTagChange(tag: string) {
    setActiveTag((prev) => (prev === tag ? '' : tag));
    setActiveType('all');
    setActiveCategory('');
  }

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
      email: item.payload.email ?? '',
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
      totpSecret: item.payload.totpSecret ?? '',
      originalPassword: item.payload.password ?? '', // save original to detect changes
      tags: item.payload.tags ?? [],
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

    const payloadData = buildPayload(form, !editingId);

    // Handle password history for login item edits
    if (editingId && form.type === 'login') {
      const originalItem = items.find((i) => i.id === editingId);
      const passwordChanged =
        form.originalPassword && form.password !== form.originalPassword;

      if (passwordChanged && originalItem) {
        // Push old password to history
        const oldEntry: PasswordHistoryEntry = {
          password: form.originalPassword,
          changedAt:
            originalItem.payload.passwordChangedAt ?? new Date().toISOString(),
        };
        const oldHistory = originalItem.payload.passwordHistory ?? [];
        payloadData.passwordHistory = [oldEntry, ...oldHistory].slice(0, 5);
        payloadData.passwordChangedAt = new Date().toISOString();
      } else {
        // Password unchanged — preserve existing history
        payloadData.passwordHistory = originalItem?.payload.passwordHistory;
        payloadData.passwordChangedAt = originalItem?.payload.passwordChangedAt;
      }
    } else if (!editingId && form.type === 'login') {
      // New item — set initial date
      payloadData.passwordChangedAt = new Date().toISOString();
    }

    setSaving(true);
    setFormError('');
    try {
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
    } catch (err: any) {
      if (err.response?.status === 404) {
        setFormError('Item was deleted elsewhere. Refreshing...');
        setTimeout(() => {
          closeModal();
          fetchItems();
        }, 1500);
      } else {
        setFormError('Failed to save. Please try again.');
      }
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

  async function handleShare(item: DecryptedVaultItem) {
    setShareModalItem(item);
    setShareLink('');
    setShareCopied(false);
  }

  function handleTypeChange(type: string) {
    setActiveType(type);
    setActiveCategory(''); // clear category when type filter changes
    setActiveTag('');
  }

  function handleCategoryChange(cat: string) {
    setActiveCategory((prev) => (prev === cat ? '' : cat)); // toggle
    setActiveType('all'); // clear type when category filter changes
    setActiveTag('');
  }

  async function generateShareLink() {
    if (!shareModalItem || !vaultKey) return;
    setShareLoading(true);
    try {
      // Generate a random one-time key (NOT the vault key)
      const shareKey = crypto.getRandomValues(new Uint8Array(32));

      // Encrypt item payload with the share key
      const dataToShare = {
        title: shareModalItem.payload.title,
        username: shareModalItem.payload.username,
        password: shareModalItem.payload.password,
        url: shareModalItem.payload.url,
        notes: shareModalItem.payload.notes,
      };
      const { ciphertext, iv } = await encrypt(
        JSON.stringify(dataToShare),
        shareKey as Uint8Array<ArrayBuffer>
      );

      // Send encrypted payload to server
      const { data } = await api.post('/api/share', {
        encryptedPayload: JSON.stringify({ ciphertext, iv }),
        expiresInHours: shareExpiry,
      });

      // Key goes in URL fragment (NEVER sent to server)
      const keyB64 = btoa(String.fromCharCode(...shareKey));
      const baseUrl = window.location.origin;
      setShareLink(`${baseUrl}/share/${data.id}#${keyB64}`);
    } catch {
      alert('Failed to create share link.');
    } finally {
      setShareLoading(false);
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
        height: '100vh',
        overflow: 'hidden',
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
        onTypeChange={handleTypeChange}
        onCategoryChange={handleCategoryChange}
        email={session?.email ?? ''}
        onLogout={handleLogout}
        onLockVault={handleLockVault}
        displayName={displayName}
        profilePhoto={profilePhoto}
        activeTag={activeTag}
        onTagChange={handleTagChange}
      />

      {/* Main */}
      <div
        className="flex-1 flex flex-col min-w-0"
        style={{ overflowY: 'auto' }}
      >
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
                id="vault-search"
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
          ) : (
            <>
              {/* Health banner — only shows when issues exist */}
              <VaultHealthBanner
                items={items}
                onDetails={() => navigate('/health')}
              />

              {displayedItems.length === 0 ? (
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
                      : activeCategory
                        ? `No items in "${activeCategory}"`
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
                  {!search && activeType !== 'favorites' && !activeCategory && (
                    <button
                      onClick={openAdd}
                      className="text-sm vx-btn"
                      style={{ color: 'var(--accent)' }}
                    >
                      Add your first item →
                    </button>
                  )}
                  {activeType === 'favorites' && !search && (
                    <p
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Star any item to see it here
                    </p>
                  )}
                </div>
              ) : activeType === 'all' && !activeCategory && !search ? (
                // Category-grouped view (default)
                <div className="flex flex-col gap-6">
                  {groupByCategory(displayedItems).map(
                    ([category, catItems]) => (
                      <div key={category}>
                        <div className="flex items-center gap-3 mb-3">
                          <span
                            className="text-xs font-semibold tracking-widest"
                            style={{
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {category}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            ({catItems.length})
                          </span>
                          <div
                            className="flex-1 h-px"
                            style={{ background: 'var(--border)' }}
                          />
                        </div>
                        <div
                          className="grid gap-3"
                          style={{
                            gridTemplateColumns:
                              'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
                          }}
                        >
                          {catItems
                            .sort((a, b) =>
                              a.payload.title.localeCompare(b.payload.title)
                            )
                            .map((item) => (
                              <VaultItemCard
                                key={item.id}
                                item={item}
                                onEdit={() => openEdit(item)}
                                onDelete={() => handleDelete(item.id)}
                                onToggleFavorite={() =>
                                  handleToggleFavorite(item)
                                }
                                onShare={() => handleShare(item)}
                              />
                            ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                // Flat grid for filtered/searched views
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
                  }}
                >
                  {displayedItems.map((item) => (
                    <VaultItemCard
                      key={item.id}
                      item={item}
                      onEdit={() => openEdit(item)}
                      onDelete={() => handleDelete(item.id)}
                      onToggleFavorite={() => handleToggleFavorite(item)}
                      onShare={() => handleShare(item)}
                    />
                  ))}
                </div>
              )}
            </>
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
                className="flex items-center justify-center w-7 h-7 rounded-lg vx-btn"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                  flexShrink: 0,
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
                    label="Username"
                    value={form.username}
                    onChange={(v) => setForm((f) => ({ ...f, username: v }))}
                    placeholder="johndoe"
                  />
                  <FormField
                    label="Email"
                    value={form.email}
                    onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    placeholder="you@example.com"
                    inputType="email"
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
                  {/* TOTP Secret — optional */}
                  <div>
                    <label
                      className="block text-xs font-medium mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Two-factor secret (optional)
                    </label>
                    <input
                      type="text"
                      value={form.totpSecret}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          totpSecret: e.target.value.trim(),
                        }))
                      }
                      aria-label="TOTP secret key"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono vx-input"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '0.5px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      placeholder="Base32 secret, e.g. JBSWY3DPEHPK3PXP"
                    />
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      From your 2FA setup page — click "Can't scan QR?" to
                      reveal the secret key
                    </p>
                  </div>
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
                      <div>
                        <label
                          className="block text-xs font-medium mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Expiry
                        </label>
                        <input
                          type="text"
                          value={form.expiry}
                          onChange={(e) => {
                            let v = e.target.value.replace(/\D/g, '');
                            if (v.length >= 2)
                              v = v.slice(0, 2) + '/' + v.slice(2);
                            if (v.length <= 5)
                              setForm((f) => ({ ...f, expiry: v }));
                          }}
                          placeholder="MM/YY"
                          maxLength={5}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none vx-input"
                          style={{
                            background: 'var(--bg-elevated)',
                            border: (() => {
                              if (!form.expiry || form.expiry.length < 5)
                                return '0.5px solid var(--border)';
                              const [m] = form.expiry.split('/');
                              const month = parseInt(m);
                              return month >= 1 && month <= 12
                                ? '0.5px solid var(--border)'
                                : '0.5px solid var(--danger)';
                            })(),
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>
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

              {/* Category with datalist autocomplete */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Category
                </label>
                <input
                  list="category-options"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="e.g. Work, Social"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none vx-input"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <datalist id="category-options">
                  {[
                    ...new Set(items.map((i) => i.category).filter(Boolean)),
                  ].map((cat) => (
                    <option key={cat} value={cat!} />
                  ))}
                </datalist>
              </div>

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
                      aria-label="Custom field type"
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
                      aria-label="Custom field type"
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

      {shareModalItem && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4 z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShareModalItem(null);
              setShareLink('');
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: 'var(--bg-surface)',
              border: '0.5px solid var(--border)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Share "{shareModalItem.payload.title}"
              </h2>
              <button
                onClick={() => {
                  setShareModalItem(null);
                  setShareLink('');
                }}
                aria-label="Close"
                className="w-7 h-7 rounded-lg flex items-center justify-center vx-btn"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                }}
              >
                ✕
              </button>
            </div>

            <div
              className="rounded-lg p-3 mb-4 text-xs"
              style={{
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
              }}
            >
              🔒 Zero-knowledge share — the encryption key is in the link only.
              The server never sees the password.
            </div>

            {!shareLink ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Link expires after
                  </label>
                  <div className="flex gap-2">
                    {[1, 24, 72, 168].map((h) => (
                      <button
                        key={h}
                        onClick={() => setShareExpiry(h)}
                        className="flex-1 py-2 rounded-lg text-xs font-medium vx-btn"
                        style={{
                          background:
                            shareExpiry === h
                              ? 'var(--accent)'
                              : 'var(--bg-elevated)',
                          color:
                            shareExpiry === h
                              ? '#fff'
                              : 'var(--text-secondary)',
                          border: '0.5px solid var(--border)',
                        }}
                      >
                        {h === 1
                          ? '1h'
                          : h === 24
                            ? '24h'
                            : h === 72
                              ? '3d'
                              : '7d'}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Sharing
                  </p>
                  <p
                    className="text-sm font-medium mt-0.5"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {shareModalItem.payload.username} • ••••••••••••
                  </p>
                </div>

                <button
                  onClick={generateShareLink}
                  disabled={shareLoading}
                  className="w-full rounded-lg py-2.5 text-sm font-medium vx-btn-accent"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    opacity: shareLoading ? 0.7 : 1,
                  }}
                >
                  {shareLoading ? 'Generating...' : 'Generate secure link'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border)',
                    wordBreak: 'break-all',
                  }}
                >
                  <p
                    className="text-xs font-mono"
                    style={{ color: 'var(--text-secondary)', fontSize: 11 }}
                  >
                    {shareLink}
                  </p>
                </div>

                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareLink);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 3000);
                  }}
                  className="w-full rounded-lg py-2.5 text-sm font-medium vx-btn-ghost"
                  style={{
                    border: '0.5px solid var(--border)',
                    color: shareCopied
                      ? 'var(--accent)'
                      : 'var(--text-primary)',
                  }}
                >
                  {shareCopied ? '✓ Copied!' : 'Copy link'}
                </button>

                <p
                  className="text-xs text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Link works once only · expires in {shareExpiry}h · anyone with
                  the link can view
                </p>
              </div>
            )}
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
  inputType = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputType?: string;
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
        type={inputType}
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
