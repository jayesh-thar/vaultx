import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import BetaBadge from '../components/BetaBadge';

interface Stats {
  users: number;
  totalItems: number;
  logins: number;
  notes: number;
  cards: number;
}

// ─── Design tokens (scoped to this page via inline CSS vars) ──────────────
// Swap the whole accent system without touching markup.
const T = {
  bg: '#0A0A0B',
  bgRaised: '#111113',
  bgCard: '#141416',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  textPrimary: '#F5F5F4',
  textSecondary: '#A8A8AC',
  textMuted: '#6B6B70',
  accent: '#E8B339', // vault-gold — distinct from generic SaaS green/blue
  accentSoft: 'rgba(232,179,57,0.12)',
  accentText: '#F3CA63',
  ok: '#34D399',
  danger: '#F87171',
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

function useFonts() {
  useEffect(() => {
    if (document.getElementById('vx-landing-fonts')) return;
    const link = document.createElement('link');
    link.id = 'vx-landing-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }, []);
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) return;
    const duration = 1100;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else setDisplay(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

// ─── Icons (inline SVG — no emoji, per design system rules) ───────────────
const Icon = {
  Shield: (p: { size?: number }) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 2.5l7.5 2.7v6.1c0 4.7-3.2 8.4-7.5 9.7-4.3-1.3-7.5-5-7.5-9.7V5.2L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.7 12.2l2.3 2.3 4.3-4.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Key: (p: { size?: number }) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="8" cy="15" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10.5 12.5L19 4M19 4v4M19 4h-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Puzzle: (p: { size?: number }) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M9 4h3.5a1.5 1.5 0 011.5 1.5V7a2 2 0 100 4v1.5a1.5 1.5 0 01-1.5 1.5H11a2 2 0 11-4 0H5.5A1.5 1.5 0 014 12.5V9a2 2 0 110-4V3.5A1.5 1.5 0 015.5 2H7a2 2 0 002 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        transform="translate(2 2) scale(0.85)"
      />
    </svg>
  ),
  Pulse: (p: { size?: number }) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M3 12h4l2-7 4 14 2-7h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Clock: (p: { size?: number }) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Card: (p: { size?: number }) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="3"
        y="6"
        width="18"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M3 10.5h18" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6.5 14.5h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  Github: (p: { size?: number }) => (
    <svg
      width={p.size ?? 16}
      height={p.size ?? 16}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48 0-.24-.01-.87-.01-1.71-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.16.58.67.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z" />
    </svg>
  ),
  ArrowRight: (p: { size?: number }) => (
    <svg
      width={p.size ?? 16}
      height={p.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Plus: (p: { size?: number }) => (
    <svg
      width={p.size ?? 14}
      height={p.size ?? 14}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  Monitor: (p: { size?: number }) => (
    <svg
      width={p.size ?? 18}
      height={p.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9 20h6M12 16v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  Bug: (p: { size?: number }) => (
    <svg
      width={p.size ?? 18}
      height={p.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="8"
        y="7"
        width="8"
        height="11"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9 9l-3-2M15 9l3-2M9 13H4M20 13h-5M9 17l-3 2M15 17l3 2M12 4v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  Phone: (p: { size?: number }) => (
    <svg
      width={p.size ?? 18}
      height={p.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="6.5"
        y="2.5"
        width="11"
        height="19"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M10.5 18.5h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  Globe: (p: { size?: number }) => (
    <svg
      width={p.size ?? 18}
      height={p.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
  Lock: (p: { size?: number }) => (
    <svg
      width={p.size ?? 20}
      height={p.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="4.5"
        y="11"
        width="15"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 11V7.5a4 4 0 018 0V11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16" r="1.4" fill="currentColor" />
    </svg>
  ),
};

// ─── Hero encryption visual — small animated lock+stream, replaces bounce emoji ─
function EncryptVisual() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % 3), 1400);
    return () => clearInterval(t);
  }, []);
  const labels = ['plaintext', 'AES-256-GCM', 'ciphertext'];
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        borderRadius: 999,
        background: T.bgRaised,
        border: `1px solid ${T.border}`,
        fontFamily: T.mono,
        fontSize: 12,
        color: T.textSecondary,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: T.ok,
          boxShadow: `0 0 0 3px ${T.ok}22`,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          transition: 'color 0.3s',
          color: phase === 0 ? T.textPrimary : T.textMuted,
        }}
      >
        {labels[0]}
      </span>
      <Icon.ArrowRight size={12} />
      <span
        style={{
          color: phase === 1 ? T.accentText : T.textMuted,
          transition: 'color 0.3s',
        }}
      >
        {labels[1]}
      </span>
      <Icon.ArrowRight size={12} />
      <span
        style={{
          color: phase === 2 ? T.textPrimary : T.textMuted,
          transition: 'color 0.3s',
        }}
      >
        {labels[2]}
      </span>
    </div>
  );
}

// ─── Scroll-aware navbar ────────────────────────────────────────────────────
function Navbar({
  stars,
  navigate,
}: {
  stars: number | null;
  navigate: (p: string) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        transition:
          'background 0.25s ease, border-color 0.25s ease, padding 0.25s ease',
        background: scrolled ? 'rgba(10,10,11,0.78)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px) saturate(160%)' : 'none',
        borderBottom: `1px solid ${scrolled ? T.border : 'transparent'}`,
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: scrolled ? '12px 24px' : '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'padding 0.25s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: T.accentSoft,
              color: T.accentText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon.Lock size={16} />
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: T.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            VaultX
          </span>
          <BetaBadge />
        </div>

        {/* Desktop nav links */}
        <nav
          style={{ display: 'flex', alignItems: 'center', gap: 28 }}
          className="vx-nav-links"
        >
          {['Features', 'FAQ', 'Roadmap'].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              style={{
                fontSize: 13.5,
                color: T.textSecondary,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {label}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href="https://github.com/jayesh-thar/vaultx"
            target="_blank"
            rel="noopener noreferrer"
            className="vx-gh-link"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 12px',
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              color: T.textSecondary,
              fontSize: 13,
              textDecoration: 'none',
              fontFamily: T.mono,
            }}
          >
            <Icon.Github size={14} />
            {stars !== null && <span>{stars.toLocaleString()}</span>}
          </a>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: T.accent,
              color: '#1A1300',
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Open VaultX
          </button>
          <button
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((p) => !p)}
            className="vx-burger"
            style={{
              display: 'none',
              width: 36,
              height: 36,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: T.textPrimary,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="vx-mobile-menu"
          style={{
            borderTop: `1px solid ${T.border}`,
            background: T.bg,
            padding: '12px 24px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {['Features', 'FAQ', 'Roadmap'].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              onClick={() => setMobileOpen(false)}
              style={{
                padding: '10px 4px',
                color: T.textSecondary,
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              {label}
            </a>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 720px) {
          .vx-nav-links { display: none !important; }
          .vx-burger { display: flex !important; }
          .vx-gh-link span { display: none; }
        }
      `}</style>
    </header>
  );
}

const FEATURES = [
  {
    icon: Icon.Shield,
    title: 'Zero-knowledge encryption',
    desc: 'AES-256-GCM encryption happens on your device before anything reaches our servers.',
  },
  {
    icon: Icon.Key,
    title: 'Recovery key',
    desc: 'A one-time key lets you reset your password without losing a single saved item.',
  },
  {
    icon: Icon.Puzzle,
    title: 'Browser extension',
    desc: 'Autofill and capture credentials automatically as you browse — Chrome & Edge.',
  },
  {
    icon: Icon.Pulse,
    title: 'Breach monitoring',
    desc: 'Every password checked against Have I Been Pwned via k-anonymity — nothing leaves your device.',
  },
  {
    icon: Icon.Clock,
    title: 'Built-in TOTP',
    desc: 'Store 2FA secrets next to logins and get live-refreshing codes in your vault.',
  },
  {
    icon: Icon.Card,
    title: 'PIN-protected cards',
    desc: 'Payment cards sit behind a second PIN, fully independent of your master password.',
  },
];

const FAQS = [
  {
    q: 'Can VaultX employees see my passwords?',
    simple:
      "No. Everything is locked with a secret only you know before it ever leaves your device. We just store the locked box — we don't have the key.",
    technical:
      'All data is encrypted client-side with AES-256-GCM using a key derived via PBKDF2 (600,000 iterations) from your master password. The server only ever receives ciphertext and never sees your password or derived keys.',
  },
  {
    q: 'What happens if I forget my master password?',
    simple:
      "If you saved your recovery key (we give you one when you sign up), you can reset your password and keep everything. Without it, resetting clears your vault — that's the tradeoff for true privacy.",
    technical:
      'A random 32-byte recovery key is generated at registration and used to separately encrypt your Master Key (recovery_key_enc). Resetting via recovery key decrypts and re-wraps the same Master Key with a new password-derived key — vault items remain decryptable. The OTP-based reset instead generates a NEW Master Key, making old items permanently undecryptable by design.',
  },
  {
    q: 'Is the browser extension safe to install?',
    simple:
      'Yes — it only activates on pages with login or payment forms, and all the encryption happens locally before anything is sent to our servers.',
    technical:
      'The extension uses Manifest V3 with a service worker for message routing. The master key lives only in chrome.storage.session (cleared on browser close); chrome.storage.local only persists an access token for re-unlock. Content scripts run on all pages except an excluded list, and only read form field values, never page content unrelated to forms.',
  },
  {
    q: 'What if VaultX shuts down — do I lose my data?',
    simple:
      'You can export an encrypted backup of your entire vault at any time from Settings, so your data is never locked into one service.',
    technical:
      "The Data tab in Settings exports all vault_items as a JSON file containing the encrypted_data/iv blobs as-is. Since decryption only requires your master password (client-side), this export remains fully restorable independent of VaultX's infrastructure.",
  },
];

function FaqItem({
  q,
  simple,
  technical,
}: {
  q: string;
  simple: string;
  technical: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'simple' | 'technical'>('simple');
  const [hovering, setHovering] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: T.bgCard,
        border: `1px solid ${open || hovering ? T.borderStrong : T.border}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovering && !open ? 'translateY(-1px)' : 'none',
      }}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 18px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 14.5, fontWeight: 600, color: T.textPrimary }}>
          {q}
        </span>
        <span
          style={{
            color: T.textMuted,
            transform: open ? 'rotate(45deg)' : 'none',
            transition: 'transform 0.2s',
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          <Icon.Plus size={16} />
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['simple', 'technical'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  fontSize: 11.5,
                  padding: '5px 10px',
                  borderRadius: 7,
                  fontWeight: 600,
                  fontFamily: m === 'technical' ? T.mono : T.sans,
                  cursor: 'pointer',
                  background: mode === m ? T.accentSoft : 'transparent',
                  color: mode === m ? T.accentText : T.textMuted,
                  border: `1px solid ${mode === m ? 'transparent' : T.border}`,
                }}
              >
                {m === 'simple' ? 'Simple' : 'Technical'}
              </button>
            ))}
          </div>
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.65,
              color: T.textSecondary,
              margin: 0,
            }}
          >
            {mode === 'simple' ? simple : technical}
          </p>
        </div>
      )}
    </div>
  );
}

function SpotlightCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [hovering, setHovering] = useState(false);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: 'relative',
        borderRadius: 16,
        padding: 22,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'border-color 0.25s, transform 0.25s',
        transform: hovering ? 'translateY(-2px)' : 'none',
      }}
      className="vx-feature-card"
    >
      {/* Spotlight layer */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity: hovering ? 1 : 0,
          transition: 'opacity 0.3s',
          background: `radial-gradient(220px circle at ${pos.x}% ${pos.y}%, ${T.accentSoft}, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Border glow ring on hover */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 16,
          border: `1px solid ${hovering ? 'rgba(232,179,57,0.35)' : 'transparent'}`,
          transition: 'border-color 0.3s',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const ROADMAP = [
  {
    icon: Icon.Monitor,
    title: 'Desktop app',
    desc: 'Native offline-first app for Windows/Mac/Linux with the same zero-knowledge vault.',
  },
  {
    icon: Icon.Bug,
    title: 'In-app feedback',
    desc: 'Submit bugs and feature ideas directly from VaultX — coming soon.',
  },
  {
    icon: Icon.Phone,
    title: 'Mobile app',
    desc: 'iOS and Android apps with biometric unlock.',
  },
  {
    icon: Icon.Globe,
    title: 'Firefox extension',
    desc: 'Bringing autofill and capture to Firefox users.',
  },
];

export default function Landing() {
  useFonts();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get('/api/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {});
    fetch('https://api.github.com/repos/jayesh-thar/vaultx')
      .then((r) => r.json())
      .then((d) =>
        setStars(
          typeof d.stargazers_count === 'number' ? d.stargazers_count : 0
        )
      )
      .catch(() => {});
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        fontFamily: T.sans,
        color: T.textPrimary,
      }}
    >
      {/* Ambient background glow — subtle, not a generic gradient blob fest */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `radial-gradient(560px 320px at 50% -10%, ${T.accentSoft}, transparent 70%)`,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Navbar stars={stars} navigate={navigate} />

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section
          ref={heroRef}
          style={{
            maxWidth: 780,
            margin: '0 auto',
            padding: '72px 24px 56px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 24,
          }}
        >
          <EncryptVisual />

          <h1
            style={{
              fontSize: 'clamp(2.1rem, 5.5vw, 3.4rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.08,
              margin: 0,
              color: T.textPrimary,
            }}
          >
            One vault. Everything sensitive.
            <br />
            <span style={{ color: T.accentText }}>Truly private.</span>
          </h1>

          <p
            style={{
              fontSize: 16.5,
              lineHeight: 1.6,
              color: T.textSecondary,
              maxWidth: 560,
              margin: 0,
            }}
          >
            VaultX stores your login credentials, secure notes, and payment
            cards — encrypted on your device before anything is sent anywhere.
            One master password unlocks it all; a separate PIN guards your
            cards.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={() => navigate('/register')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 22px',
                borderRadius: 11,
                border: 'none',
                background: T.accent,
                color: '#1A1300',
                fontSize: 14.5,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 8px 24px -8px ${T.accentSoft}`,
              }}
            >
              Create your vault
              <Icon.ArrowRight size={15} />
            </button>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '12px 22px',
                borderRadius: 11,
                border: `1px solid ${T.border}`,
                background: 'transparent',
                color: T.textPrimary,
                fontSize: 14.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </div>

          <p
            style={{
              fontFamily: T.mono,
              fontSize: 11.5,
              color: T.textMuted,
              margin: 0,
              letterSpacing: '0.01em',
            }}
          >
            AES-256-GCM &nbsp;·&nbsp; PBKDF2 600k iterations &nbsp;·&nbsp; open
            source
          </p>
        </section>

        {/* ── Stats strip ──────────────────────────────────────────────── */}
        <section
          style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 64px' }}
        >
          <div
            style={{
              borderRadius: 18,
              border: `1px solid ${T.border}`,
              background: T.bgCard,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              overflow: 'hidden',
            }}
            className="vx-stats-grid"
          >
            {[
              { label: 'Vaults created', value: stats?.users ?? 0 },
              { label: 'Items secured', value: stats?.totalItems ?? 0 },
              { label: 'Logins protected', value: stats?.logins ?? 0 },
              {
                label: 'Cards & notes',
                value: (stats?.cards ?? 0) + (stats?.notes ?? 0),
              },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  padding: '26px 20px',
                  textAlign: 'center',
                  borderLeft: i === 0 ? 'none' : `1px solid ${T.border}`,
                }}
              >
                <p
                  style={{
                    fontFamily: T.mono,
                    fontSize: 26,
                    fontWeight: 600,
                    color: T.accentText,
                    margin: 0,
                  }}
                >
                  <AnimatedCounter value={s.value} />
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: T.textMuted,
                    margin: '6px 0 0',
                  }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
          <p
            style={{
              textAlign: 'center',
              fontSize: 11.5,
              color: T.textMuted,
              marginTop: 14,
            }}
          >
            Live numbers from this instance — encrypted counts only, never
            contents.
          </p>
          <style>{`
            @media (max-width: 640px) {
              .vx-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
              .vx-stats-grid > div:nth-child(3) { border-left: none !important; }
            }
          `}</style>
        </section>

        {/* ── Features (bento) ─────────────────────────────────────────── */}
        <section
          id="features"
          style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 88px' }}
        >
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2
              style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: '0 0 10px',
              }}
            >
              Built for people who care about privacy
            </h2>
            <p
              style={{
                fontSize: 14.5,
                color: T.textMuted,
                maxWidth: 480,
                margin: '0 auto',
              }}
            >
              Every design decision starts from one question: does this require
              trusting us with your data? If yes, we redesign it.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 14,
            }}
            className="vx-feature-grid"
          >
            {FEATURES.map((f) => (
              <SpotlightCard key={f.title}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: T.accentSoft,
                    color: T.accentText,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <f.icon size={19} />
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      color: T.textPrimary,
                      margin: '0 0 5px',
                    }}
                  >
                    {f.title}
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: T.textMuted,
                      margin: 0,
                    }}
                  >
                    {f.desc}
                  </p>
                </div>
              </SpotlightCard>
            ))}
          </div>
          <style>{`
            @media (max-width: 760px) {
              .vx-feature-grid { grid-template-columns: 1fr !important; }
              .vx-feature-card { grid-column: span 1 !important; }
            }
          `}</style>
        </section>

        {/* ── Beta notice ───────────────────────────────────────────────── */}
        <section
          style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px 88px' }}
        >
          <div
            style={{
              borderRadius: 16,
              padding: 22,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: 'rgba(248,113,113,0.1)',
                color: T.danger,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon.Bug size={17} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: T.textPrimary,
                  margin: '0 0 4px',
                }}
              >
                VaultX is in public beta
              </p>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: T.textMuted,
                  margin: 0,
                }}
              >
                The core is stable and your vault is encrypted end-to-end, but
                the product is still evolving. Found a bug or have an idea? Open
                an issue on GitHub.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section
          id="faq"
          style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 88px' }}
        >
          <h2
            style={{
              fontSize: 'clamp(1.4rem, 3vw, 1.85rem)',
              fontWeight: 700,
              textAlign: 'center',
              letterSpacing: '-0.02em',
              margin: '0 0 32px',
            }}
          >
            Common questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FAQS.map((f) => (
              <FaqItem key={f.q} {...f} />
            ))}
          </div>
        </section>

        {/* ── Roadmap ──────────────────────────────────────────────────── */}
        <section
          id="roadmap"
          style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 96px' }}
        >
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 'clamp(1.4rem, 3vw, 1.85rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: '0 0 8px',
              }}
            >
              What's next
            </h2>
            <p style={{ fontSize: 13.5, color: T.textMuted, margin: 0 }}>
              Actively evolving during beta.
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
            className="vx-roadmap-grid"
          >
            {ROADMAP.map((r) => (
              <div
                key={r.title}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: 18,
                  borderRadius: 14,
                  background: T.bgCard,
                  border: `1px solid ${T.border}`,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: T.bgRaised,
                    color: T.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <r.icon size={16} />
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: T.textPrimary,
                      margin: '0 0 3px',
                    }}
                  >
                    {r.title}
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: T.textMuted,
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {r.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <style>{`
            @media (max-width: 560px) {
              .vx-roadmap-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section
          style={{
            maxWidth: 700,
            margin: '0 auto',
            padding: '0 24px 96px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              borderRadius: 20,
              padding: '48px 32px',
              background: `linear-gradient(160deg, ${T.accentSoft}, transparent 65%), ${T.bgCard}`,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: T.accentSoft,
                color: T.accentText,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
              }}
            >
              <Icon.Lock size={22} />
            </div>
            <h2
              style={{
                fontSize: 'clamp(1.4rem, 3vw, 1.8rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: '0 0 10px',
              }}
            >
              Your data, your key, your control.
            </h2>
            <p style={{ fontSize: 14, color: T.textMuted, margin: '0 0 24px' }}>
              Free to start. Takes less than a minute to set up.
            </p>
            <button
              onClick={() => navigate('/register')}
              style={{
                padding: '13px 28px',
                borderRadius: 11,
                border: 'none',
                background: T.accent,
                color: '#1A1300',
                fontSize: 14.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Create your vault — it's free
            </button>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer
          style={{
            borderTop: `1px solid ${T.border}`,
            padding: '28px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
            VaultX · Open source ·{' '}
            <a
              href="https://github.com/jayesh-thar/vaultx"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: T.accentText, textDecoration: 'none' }}
            >
              GitHub
            </a>{' '}
            · Built with care for privacy
          </p>
        </footer>
      </div>
    </div>
  );
}
