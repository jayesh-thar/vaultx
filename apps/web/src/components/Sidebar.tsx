import { useNavigate } from 'react-router-dom';
import type { DecryptedVaultItem } from '../pages/Dashboard';
import { useState, useRef, useEffect } from 'react';

interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
  items: DecryptedVaultItem[];
  activeType: string;
  activeCategory: string;
  onTypeChange: (type: string) => void;
  onCategoryChange: (cat: string) => void;
  email: string;
  onLogout: () => void;
  onLockVault: () => void;
  displayName: string;
  profilePhoto: string | null;
}

// SVG icons — inline for zero deps
const Icons = {
  lock: (
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
  ),
  login: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  note: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 8h8M8 12h8M8 16h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  card: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect
        x="2"
        y="5"
        width="20"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  star: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  settings: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
};

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${!active ? 'vx-nav-item' : ''}`}
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      <span
        style={{
          color: active ? 'var(--accent)' : 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            background: active ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
            color: active ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({
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
}: SidebarProps) {
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  const categories = [
    ...new Set(items.filter((i) => i.category).map((i) => i.category!)),
  ];

  const counts = {
    all: items.length,
    favorites: items.filter((i) => i.payload.favorite).length,
    login: items.filter((i) => i.type === 'login').length,
    note: items.filter((i) => i.type === 'note').length,
    card: items.filter((i) => i.type === 'card').length,
  };

  const sidebarContent = (
    <div
      className="flex flex-col"
      style={{
        width: 240,
        minHeight: '100vh',
        background: 'var(--bg-surface)',
        borderRight: '0.5px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
            }}
          >
            {Icons.lock}
          </div>
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            VaultX
          </span>
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{ color: 'var(--text-muted)' }}
          >
            {Icons.close}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-4"
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        {/* Main */}
        <div>
          <p
            className="text-xs font-medium px-3 mb-2"
            style={{
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Vault
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <NavItem
              icon={Icons.lock}
              label="All Items"
              count={counts.all}
              active={activeType === 'all'}
              onClick={() => {
                onTypeChange('all');
                onCategoryChange('All');
                if (isMobile) onClose();
              }}
            />
            <NavItem
              icon={Icons.star}
              label="Favorites"
              count={counts.favorites}
              active={activeType === 'favorites'}
              onClick={() => {
                onTypeChange('favorites');
                if (isMobile) onClose();
              }}
            />
          </div>
        </div>

        {/* Types */}
        <div>
          <p
            className="text-xs font-medium px-3 mb-2"
            style={{
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Types
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <NavItem
              icon={Icons.login}
              label="Logins"
              count={counts.login}
              active={activeType === 'login'}
              onClick={() => {
                onTypeChange('login');
                if (isMobile) onClose();
              }}
            />
            <NavItem
              icon={Icons.note}
              label="Secure Notes"
              count={counts.note}
              active={activeType === 'note'}
              onClick={() => {
                onTypeChange('note');
                if (isMobile) onClose();
              }}
            />
            <NavItem
              icon={Icons.card}
              label="Cards"
              count={counts.card}
              active={activeType === 'card'}
              onClick={() => {
                onTypeChange('card');
                if (isMobile) onClose();
              }}
            />
          </div>
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div>
            <p
              className="text-xs font-medium px-3 mb-2"
              style={{
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Categories
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {categories.map((cat) => (
                <NavItem
                  key={cat}
                  icon={<span style={{ fontSize: 10 }}>●</span>}
                  label={cat}
                  count={items.filter((i) => i.category === cat).length}
                  active={activeCategory === cat && activeType !== 'favorites'}
                  onClick={() => {
                    onCategoryChange(cat);
                    onTypeChange('all');
                    if (isMobile) onClose();
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom — Profile + Settings + Logout */}
      {/* Profile dropdown */}
      <div
        ref={profileRef}
        className="px-3 py-3"
        style={{
          borderTop: '0.5px solid var(--border)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {/* Popup menu — opens upward */}
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
            {/* Email header */}
            <div
              className="px-4 py-3"
              style={{ borderBottom: '0.5px solid var(--border)' }}
            >
              <p
                className="text-xs font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {email.split('@')[0]}
              </p>
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {email}
              </p>
            </div>

            {/* Options */}
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Settings
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
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
                Lock vault
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Log out
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
            className="flex items-center justify-center w-7 h-7 rounded-full overflow-hidden flex-shrink-0"
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
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p
              className="text-xs font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {displayName} {/* was email.split('@')[0] */}
            </p>
            <p
              className="text-xs truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {email}
            </p>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            style={{
              color: 'var(--text-muted)',
              transform: profileOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
              flexShrink: 0,
            }}
          >
            <path
              d="M18 15l-6-6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  // Mobile: fixed overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={onClose}
          />
        )}
        {/* Drawer */}
        <div
          className="fixed top-0 left-0 h-full z-50"
          style={{
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
          }}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  // Desktop: always visible in flow
  return sidebarContent;
}
