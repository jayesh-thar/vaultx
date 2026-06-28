import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { MSG } from '../../lib/messages';
import type {
  GetVaultItemsResponse,
  CheckSessionResponse,
} from '../../lib/messages';
import type { DecryptedItem } from '../../types';
import VaultItem from '../components/VaultItem';
import AddItemModal from '../components/AddItemModal';

interface Props {
  onLogout: () => void;
}
type Filter = 'all' | 'login' | 'note' | 'card';
type ItemTypeChoice = 'login' | 'note' | 'card';

export default function Vault({ onLogout }: Props) {
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [email, setEmail] = useState('');
  const isFetchingRef = useRef(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const [showAddModal, setShowAddModal] = useState<ItemTypeChoice | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [pendingCred, setPendingCred] = useState<{
    title: string;
    domain: string;
    url: string;
    fields: Array<{ name: string; type: string; value: string; label: string }>;
    expiresAt: number;
  } | null>(null);
  const [recentSave, setRecentSave] = useState<{
    id: string;
    title: string;
    expiresAt: number;
  } | null>(null);
  const [currentTabDomain, setCurrentTabDomain] = useState<string | null>(null);
  const [domainItems, setDomainItems] = useState<DecryptedItem[]>([]);
  const [showAutofillPanel, setShowAutofillPanel] = useState(false);

  useEffect(() => {
    loadItems();
    chrome.runtime
      .sendMessage<object, CheckSessionResponse>({ type: MSG.CHECK_SESSION })
      .then((res) => {
        if (res.email) setEmail(res.email);
      });

    // Get current tab domain for autofill suggestion
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url;
      if (!url) return;

      // Skip VaultX's own pages and browser pages
      if (
        url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.includes('vault-x.xyz') ||
        url.includes('vaultx-jayesh.vercel.app') ||
        url.includes('localhost')
      )
        return;

      try {
        const domain = new URL(url).hostname;
        setCurrentTabDomain(domain);

        // First check if the page actually has a login form visible
        chrome.tabs.sendMessage(
          tab.id!,
          { type: 'GET_FORM_FIELDS' },
          (fields) => {
            if (chrome.runtime.lastError) return; // content script not available

            const hasPasswordField = (fields?.fields ?? []).some(
              (f: any) => f.type === 'password'
            );

            if (!hasPasswordField) return; // no login form on this page — skip

            chrome.runtime
              .sendMessage({
                type: MSG.GET_ITEMS_FOR_DOMAIN,
                payload: { domain },
              })
              .then((res: any) => {
                if (res?.items?.length) {
                  setDomainItems(res.items);
                  setShowAutofillPanel(true);
                }
              });
          }
        );
      } catch {
        /* ignore */
      }
    });
    // Load auto-save preference
    chrome.storage.local.get('vaultx_autosave').then((r) => {
      setAutoSave(r.vaultx_autosave !== false);
    });

    // Check for pending credential
    chrome.runtime
      .sendMessage({ type: MSG.GET_PENDING_CREDENTIAL })
      .then((res: any) => {
        if (res) setPendingCred(res);
      });

    // Check for a recently auto-saved item (5-min undo window)
    chrome.storage.session.get('lastAutoSavedItem').then((r) => {
      const item = r.lastAutoSavedItem as
        | {
            id: string;
            title: string;
            expiresAt: number;
          }
        | undefined;
      if (item && Date.now() < item.expiresAt) setRecentSave(item);
    });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setShowProfile(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function toggleAutoSave() {
    const newVal = !autoSave;
    setAutoSave(newVal);
    await chrome.storage.local.set({ vaultx_autosave: newVal });
  }

  async function loadItems() {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const res = await chrome.runtime.sendMessage<
        object,
        GetVaultItemsResponse
      >({
        type: MSG.GET_VAULT_ITEMS,
      });
      if (res.success && res.items) {
        const seen = new Set<string>();
        const unique = res.items.filter((i) => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        });
        setItems(unique);
      } else if (res.error === 'SESSION_EXPIRED') {
        // onLogout();
        // Don't call onLogout() — that clears persistedAuth and forces full login
        // Just go back to App which will re-check session and show re-unlock
        window.location.reload();
      } else {
        setError(res.error ?? 'Failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
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

  const initials = email ? email.slice(0, 2).toUpperCase() : 'VX';
  const displayName = email ? email.split('@')[0] : 'User';

  return (
    <div style={s.page}>
      {/* Topbar */}
      <div style={s.topbar}>
        <div style={s.logo}>
          🔐 <span style={s.logoText}>VaultX</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            style={s.iconBtn}
            onClick={() => {
              isFetchingRef.current = false;
              loadItems();
            }}
            title="Refresh"
          >
            ↻
          </button>
          <div style={{ position: 'relative' }} ref={profileRef}>
            <button
              style={s.avatarBtn}
              onClick={() => setShowProfile((p) => !p)}
            >
              {initials}
            </button>
            {showProfile && (
              <div style={s.profilePopup}>
                <div style={s.profileHeader}>
                  <div style={s.avatarLarge}>{initials}</div>
                  <div style={{ overflow: 'hidden' }}>
                    <p style={s.profileName}>{displayName}</p>
                    <p style={s.profileEmail}>{email}</p>
                  </div>
                </div>
                <div style={s.divider} />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Items
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {counts.all}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Encryption
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      AES-256-GCM
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Status
                    </span>
                    <span style={{ fontSize: 12, color: '#10b981' }}>
                      ● Encrypted
                    </span>
                  </div>
                </div>

                <div style={s.divider} />

                {/* Auto-save toggle */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 0',
                  }}
                >
                  <div>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                      Auto-save credentials
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        color: '#475569',
                        margin: '2px 0 0',
                      }}
                    >
                      Saves on form submit · this browser only
                    </p>
                  </div>
                  <div
                    onClick={toggleAutoSave}
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: autoSave ? '#10b981' : '#334155',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        left: autoSave ? 18 : 2,
                      }}
                    />
                  </div>
                </div>

                <button
                  style={s.profileAction}
                  onClick={() => {
                    chrome.tabs.create({
                      url: `${import.meta.env.VITE_WEB_URL}/settings`,
                    });
                    setShowProfile(false);
                  }}
                >
                  ⚙️ Settings & Card PIN
                </button>
                <button
                  style={{ ...s.profileAction, color: '#f87171', marginTop: 4 }}
                  onClick={handleLogout}
                >
                  🔒 Lock & Sign out
                </button>
              </div>
            )}
          </div>
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
            {f}
            {counts[f] > 0 && <span style={s.badge}>{counts[f]}</span>}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 14px 8px', position: 'relative' }}>
        <button
          style={{
            width: '100%',
            padding: '7px 0',
            borderRadius: 8,
            border: '1px solid #334155',
            background: 'transparent',
            color: '#10b981',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => {
            if (filter === 'all') setShowTypePicker((p) => !p);
            else setShowAddModal(filter as ItemTypeChoice);
          }}
        >
          + Add {filter === 'all' ? 'item' : filter}
        </button>
        {showTypePicker && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 14,
              right: 14,
              marginTop: 4,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              overflow: 'hidden',
              zIndex: 10,
            }}
          >
            {(['login', 'note', 'card'] as ItemTypeChoice[]).map((t) => (
              <button
                key={t}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: '#f1f5f9',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setShowAddModal(t);
                  setShowTypePicker(false);
                }}
              >
                {t === 'login'
                  ? '🔑 Login'
                  : t === 'note'
                    ? '📝 Note'
                    : '💳 Card'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Autofill panel — shown when current tab has saved logins */}
      {showAutofillPanel && domainItems.length > 0 && (
        <div
          style={{
            background: '#0D2818',
            border: '1px solid #10b981',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#a7f3d0',
                margin: 0,
              }}
            >
              🔐 Autofill on {currentTabDomain}
            </p>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#475569',
                cursor: 'pointer',
                fontSize: 12,
              }}
              onClick={() => setShowAutofillPanel(false)}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {domainItems.slice(0, 3).map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#0f172a',
                  borderRadius: 7,
                  padding: '6px 10px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#f1f5f9',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.payload.title}
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: '#64748b',
                      margin: '1px 0 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.payload.username || item.payload.email || '—'}
                  </p>
                </div>
                <button
                  style={{
                    flexShrink: 0,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginLeft: 8,
                  }}
                  onClick={() => {
                    chrome.tabs.query(
                      { active: true, currentWindow: true },
                      (tabs) => {
                        if (tabs[0]?.id) {
                          chrome.tabs.sendMessage(tabs[0].id, {
                            type: 'AUTOFILL_CREDENTIALS',
                            payload: {
                              email: item.payload.email,
                              username: item.payload.username,
                              password: item.payload.password,
                            },
                          });
                        }
                      }
                    );
                    setShowAutofillPanel(false);
                  }}
                >
                  Fill
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentSave && (
        <div
          style={{
            background: '#0D2818',
            border: '1px solid #10b981',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: '#a7f3d0' }}>
            ✓ Auto-saved "{recentSave.title.slice(0, 22)}"
          </span>
          <button
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={async () => {
              await chrome.runtime.sendMessage({
                type: MSG.DELETE_VAULT_ITEM,
                payload: { id: recentSave.id },
              });
              await chrome.storage.session.remove('lastAutoSavedItem');
              setRecentSave(null);
              isFetchingRef.current = false;
              loadItems();
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* pending banner */}
      {pendingCred && (
        <div
          style={{
            background: '#1e3a5f',
            border: '1px solid #3b82f6',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 14 }}>💾</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#f1f5f9',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Unsaved: {pendingCred.title}
              </p>
              <p style={{ fontSize: 10, color: '#64748b', margin: '2px 0 0' }}>
                {pendingCred.domain} · expires in{' '}
                {Math.max(
                  0,
                  Math.round((pendingCred.expiresAt - Date.now()) / 60000)
                )}
                m
              </p>
            </div>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#475569',
                cursor: 'pointer',
                fontSize: 12,
              }}
              onClick={async () => {
                await chrome.runtime.sendMessage({
                  type: MSG.CLEAR_PENDING_CREDENTIAL,
                });
                setPendingCred(null);
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={async () => {
                await chrome.runtime.sendMessage({
                  type: MSG.SAVE_FORM_FIELDS,
                  payload: { ...pendingCred, forceSave: true },
                });
                await chrome.runtime.sendMessage({
                  type: MSG.CLEAR_PENDING_CREDENTIAL,
                });
                setPendingCred(null);
                isFetchingRef.current = false;
                loadItems();
              }}
            >
              Save to VaultX
            </button>
            <button
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: '1px solid #334155',
                background: 'transparent',
                color: '#64748b',
                fontSize: 12,
                cursor: 'pointer',
              }}
              onClick={async () => {
                await chrome.runtime.sendMessage({
                  type: 'CLEAR_PENDING_CREDENTIAL',
                });
                setPendingCred(null);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Items — scrollable */}
      <div style={s.list}>
        {loading && (
          <div style={s.centerMsg}>
            <p style={{ color: '#475569', fontSize: 13 }}>
              Decrypting vault...
            </p>
          </div>
        )}
        {error && (
          <p
            style={{
              color: '#f87171',
              fontSize: 12,
              textAlign: 'center',
              padding: 16,
            }}
          >
            {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={s.centerMsg}>
            <p style={{ fontSize: 24 }}>🔍</p>
            <p style={{ color: '#64748b', fontSize: 13 }}>
              {search ? 'No results' : 'No items yet'}
            </p>
            {!search && (
              <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>
                Add items from the web app
              </p>
            )}
          </div>
        )}
        {filtered.map((item) => (
          <VaultItem
            key={item.id}
            item={item}
            expandedId={expandedId}
            onExpand={(id) =>
              setExpandedId((prev) => (prev === id ? null : id))
            }
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
        <span style={{ color: '#10b981' }}>● Zero-knowledge</span>
      </div>

      {showAddModal && (
        <AddItemModal
          type={showAddModal}
          onClose={() => setShowAddModal(null)}
          onSaved={() => {
            isFetchingRef.current = false;
            loadItems();
          }}
        />
      )}
    </div>
  );
}
const s: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: 580,
    background: '#0f172a',
    overflow: 'hidden',
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 },
  logoText: { fontWeight: 800, color: '#10b981', fontSize: 15 },
  iconBtn: {
    padding: '4px 9px',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: 'transparent',
    color: '#64748b',
    fontSize: 14,
    cursor: 'pointer',
  },
  avatarBtn: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: '2px solid #10b981',
    background: '#10b98122',
    color: '#10b981',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePopup: {
    position: 'absolute',
    right: 0,
    top: 36,
    width: 220,
    background: '#1e293b',
    borderRadius: 12,
    border: '1px solid #334155',
    padding: 12,
    zIndex: 100,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatarLarge: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#10b98122',
    border: '2px solid #10b981',
    color: '#10b981',
    fontSize: 13,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#f1f5f9',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  profileEmail: {
    fontSize: 10,
    color: '#64748b',
    margin: '2px 0 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  divider: { height: 1, background: '#334155', margin: '10px 0' },
  profileAction: {
    padding: '7px 8px',
    borderRadius: 7,
    border: 'none',
    background: '#0f172a',
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  searchWrap: {
    position: 'relative',
    margin: '10px 14px 0',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    color: '#475569',
    fontSize: 16,
  },
  search: {
    width: '100%',
    padding: '8px 32px',
    borderRadius: 8,
    border: '1px solid #1e293b',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: 13,
    outline: 'none',
  },
  clearBtn: {
    position: 'absolute',
    right: 8,
    background: 'none',
    border: 'none',
    color: '#475569',
    cursor: 'pointer',
    fontSize: 12,
  },
  tabs: {
    display: 'flex',
    gap: 3,
    padding: '8px 14px',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '5px 2px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabActive: { background: '#1e293b', color: '#10b981', fontWeight: 600 },
  badge: {
    background: '#10b981',
    color: '#000',
    borderRadius: 10,
    padding: '0 4px',
    fontSize: 9,
    fontWeight: 700,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  centerMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 6,
    minHeight: 120,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 14px',
    borderTop: '1px solid #1e293b',
    fontSize: 10,
    color: '#475569',
    flexShrink: 0,
  },
};
