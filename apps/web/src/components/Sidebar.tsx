import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DecryptedVaultItem } from '../pages/Dashboard';

// ─── Icon set ─────────────────────────────────────────────────────────────────
const VaultIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect
      x="3"
      y="11"
      width="18"
      height="11"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M7 11V7a5 5 0 0110 0v4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const PersonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    <path
      d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const NoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M7 8h10M7 12h10M7 16h6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const CardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect
      x="1"
      y="4"
      width="22"
      height="16"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M1 10h22" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect
      x="3"
      y="11"
      width="18"
      height="11"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M7 11V7a5 5 0 0110 0v4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path
      d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const ChevronIcon = ({ up }: { up: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    style={{
      transform: up ? 'rotate(180deg)' : 'none',
      transition: 'transform 0.2s',
    }}
  >
    <path
      d="M18 15l-6-6-6 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm ${!active ? 'vx-nav-item' : ''}`}
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: danger
          ? 'var(--danger)'
          : active
            ? 'var(--accent)'
            : 'var(--text-secondary)',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          color: danger
            ? 'var(--danger)'
            : active
              ? 'var(--accent)'
              : 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span className="flex-1 truncate text-sm">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className="text-xs rounded-md px-1.5 py-0.5"
          style={{
            background: active ? 'var(--accent)' : 'var(--bg-elevated)',
            color: active ? '#fff' : 'var(--text-muted)',
            minWidth: 20,
            textAlign: 'center',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
  items: DecryptedVaultItem[];
  activeType: string;
  activeCategory: string;
  onTypeChange: (t: string) => void;
  onCategoryChange: (c: string) => void;
  email: string;
  onLogout: () => void;
  onLockVault: () => void;
  displayName: string;
  profilePhoto: string | null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Sidebar(props: SidebarProps) {
  const {
    isOpen,
    isMobile,
    onClose,
    items,
    activeType,
    activeCategory,
    onTypeChange,
    onCategoryChange,
    email,
    onLogout,
    onLockVault,
    displayName,
    profilePhoto,
  } = props;

  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Click outside to close profile menu
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Compute categories from items
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      const cat = item.category?.trim();
      if (cat) map.set(cat, (map.get(cat) ?? 0) + 1);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [items]);

  // ─── Nav handler helpers — ONE handler per click ─────────────────────
  function goType(type: string) {
    onTypeChange(type); // handleTypeChange clears activeCategory internally
    if (isMobile) onClose();
  }

  function goCategory(cat: string) {
    onCategoryChange(cat); // handleCategoryChange clears activeType internally
    if (isMobile) onClose();
  }

  // ─── Sidebar content ─────────────────────────────────────────────────
  const content = (
    <div
      style={{
        width: 240,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderRight: '0.5px solid var(--border)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 py-4 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: 'var(--accent-subtle)' }}
        >
          <VaultIcon />
        </div>
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          VaultX
        </span>
        {isMobile && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg vx-btn"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable nav */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-5"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* VAULT section */}
        <div>
          <p
            className="text-xs font-semibold px-2 mb-1.5"
            style={{
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Vault
          </p>
          <NavItem
            icon={<VaultIcon />}
            label="All Items"
            count={items.length}
            active={activeType === 'all' && !activeCategory}
            onClick={() => goType('all')}
          />
          <NavItem
            icon={<StarIcon />}
            label="Favorites"
            count={items.filter((i) => i.payload?.favorite).length}
            active={activeType === 'favorites' && !activeCategory}
            onClick={() => goType('favorites')}
          />
          <NavItem
            icon={<ShieldIcon />}
            label="Health Check"
            active={false}
            onClick={() => {
              navigate('/health');
              if (isMobile) onClose();
            }}
          />
        </div>

        {/* TYPES section */}
        <div>
          <p
            className="text-xs font-semibold px-2 mb-1.5"
            style={{
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Types
          </p>
          {(
            [
              { type: 'login', label: 'Logins', icon: <PersonIcon /> },
              { type: 'note', label: 'Secure Notes', icon: <NoteIcon /> },
              { type: 'card', label: 'Cards', icon: <CardIcon /> },
            ] as const
          ).map(({ type, label, icon }) => (
            <NavItem
              key={type}
              icon={icon}
              label={label}
              count={items.filter((i) => i.type === type).length}
              active={activeType === type && !activeCategory}
              onClick={() => goType(type)}
            />
          ))}
        </div>

        {/* CATEGORIES section */}
        {categories.length > 0 && (
          <div>
            <p
              className="text-xs font-semibold px-2 mb-1.5"
              style={{
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Categories
            </p>
            {categories.map((cat) => (
              <NavItem
                key={cat.name}
                icon={
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'currentColor',
                      display: 'inline-block',
                    }}
                  />
                }
                label={cat.name}
                count={cat.count}
                active={activeCategory === cat.name}
                onClick={() => goCategory(cat.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Profile dropdown — always at bottom */}
      <div
        ref={profileRef}
        className="flex-shrink-0 px-3 py-3"
        style={{ borderTop: '0.5px solid var(--border)', position: 'relative' }}
      >
        {/* Popup menu */}
        {profileOpen && (
          <div
            className="absolute left-2 right-2 rounded-xl overflow-hidden"
            style={{
              bottom: 'calc(100% - 4px)',
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
              zIndex: 10,
            }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: '0.5px solid var(--border)' }}
            >
              <p
                className="text-xs font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {displayName}
              </p>
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {email}
              </p>
            </div>
            <div className="p-1">
              <button
                onClick={() => {
                  navigate('/settings');
                  setProfileOpen(false);
                }}
                aria-label="Settings"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm vx-sidebar-btn"
                style={{ color: 'var(--text-secondary)' }}
              >
                <SettingsIcon /> Settings
              </button>
              <button
                onClick={() => {
                  onLockVault();
                  setProfileOpen(false);
                }}
                aria-label="Lock vault"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm vx-sidebar-btn"
                style={{ color: 'var(--text-secondary)' }}
              >
                <LockIcon /> Lock vault
              </button>
              <div
                style={{
                  margin: '4px 8px',
                  borderTop: '0.5px solid var(--border)',
                }}
              />
              <button
                onClick={() => {
                  onLogout();
                  setProfileOpen(false);
                }}
                aria-label="Log out"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm vx-sidebar-btn"
                style={{ color: 'var(--danger)' }}
              >
                <LogoutIcon /> Log out
              </button>
            </div>
          </div>
        )}

        {/* Profile trigger */}
        <button
          onClick={() => setProfileOpen((p) => !p)}
          aria-label="Account menu"
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
          style={{
            background: profileOpen ? 'var(--bg-elevated)' : 'transparent',
          }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
            }}
          >
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span className="text-xs font-medium">
                {(displayName || email || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p
              className="text-xs font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {displayName}
            </p>
            <p
              className="text-xs truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {email}
            </p>
          </div>
          <ChevronIcon up={profileOpen} />
        </button>
      </div>
    </div>
  );

  // Mobile: overlay
  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={onClose}
          />
        )}
        <div
          className="fixed left-0 top-0 z-50 transition-transform duration-200"
          style={{ transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          {content}
        </div>
      </>
    );
  }

  // Desktop: sticky
  return (
    <div style={{ position: 'sticky', top: 0, height: '100vh', flexShrink: 0 }}>
      {content}
    </div>
  );
}
