import { useEffect, useState } from 'react';
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

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const duration = 1200;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return <span>{display.toLocaleString()}</span>;
}

function ShieldIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"
        stroke="#10B981"
        strokeWidth="1.5"
        fill="rgba(16,185,129,0.08)"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="#10B981"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const FEATURES = [
  {
    icon: '🔐',
    title: 'Zero-Knowledge Encryption',
    desc: 'Everything is encrypted on your device with AES-256-GCM before it ever touches our servers. We literally cannot read your data.',
  },
  {
    icon: '🔑',
    title: 'Recovery Key',
    desc: 'Forget your master password without losing your vault — a one-time recovery key lets you reset safely while keeping every item intact.',
  },
  {
    icon: '🧩',
    title: 'Browser Extension',
    desc: 'Autofill, save credentials automatically, and access your vault directly from any site — Chrome & Edge supported.',
  },
  {
    icon: '🛡️',
    title: 'Breach Monitoring',
    desc: 'Vault Health checks every password against Have I Been Pwned using k-anonymity — your passwords never leave your device.',
  },
  {
    icon: '🔢',
    title: 'Built-in 2FA (TOTP)',
    desc: 'Store TOTP secrets alongside your logins and get live-refreshing 2FA codes right in your vault.',
  },
  {
    icon: '💳',
    title: 'PIN-Protected Cards',
    desc: 'Payment cards get an extra layer — a separate PIN, independent of your master password.',
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

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        border: '0.5px solid var(--border)',
      }}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {q}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setMode('simple')}
              className="text-xs px-2 py-1 rounded-md"
              style={{
                background:
                  mode === 'simple' ? 'var(--accent-subtle)' : 'transparent',
                color:
                  mode === 'simple' ? 'var(--accent)' : 'var(--text-muted)',
                border: '0.5px solid var(--border)',
              }}
            >
              Simple
            </button>
            <button
              onClick={() => setMode('technical')}
              className="text-xs px-2 py-1 rounded-md"
              style={{
                background:
                  mode === 'technical' ? 'var(--accent-subtle)' : 'transparent',
                color:
                  mode === 'technical' ? 'var(--accent)' : 'var(--text-muted)',
                border: '0.5px solid var(--border)',
              }}
            >
              Technical
            </button>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {mode === 'simple' ? simple : technical}
          </p>
        </div>
      )}
    </div>
  );
}

const ROADMAP = [
  {
    icon: '🖥️',
    title: 'Desktop App',
    desc: 'Native offline-first app for Windows/Mac/Linux with the same zero-knowledge vault.',
  },
  {
    icon: '🐛',
    title: 'In-App Feedback Form',
    desc: 'Submit bugs and feature ideas directly from VaultX — coming soon.',
  },
  {
    icon: '📱',
    title: 'Mobile App',
    desc: 'iOS and Android apps with biometric unlock.',
  },
  {
    icon: '🌐',
    title: 'Firefox Extension',
    desc: 'Bringing autofill and capture to Firefox users.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [stars, setStars] = useState<number | null>(null);

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
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Nav */}
      <header
        className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
        style={{
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--bg-surface)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: 'var(--accent-subtle)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
            className="text-base font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            VaultX
          </span>
          <BetaBadge />
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/jayesh-thar/vaultx"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              border: '0.5px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48 0-.24-.01-.87-.01-1.71-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.16.58.67.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z" />
            </svg>
            {stars !== null && <span>★ {stars.toLocaleString()}</span>}
          </a>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Open VaultX
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 flex flex-col items-center text-center gap-6">
        <div className="animate-bounce">
          <ShieldIcon size={64} />
        </div>

        <h1
          className="text-4xl sm:text-5xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          One vault. Everything sensitive. Truly private.
        </h1>

        <p
          className="text-base sm:text-lg max-w-xl"
          style={{ color: 'var(--text-muted)' }}
        >
          VaultX stores your login credentials, secure notes, and payment cards
          — all encrypted on your device before anything is sent anywhere. One
          master password unlocks it all, a separate PIN guards your cards. We
          literally cannot read your vault.
        </p>

        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => navigate('/register')}
            className="px-6 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Create your vault — it's free
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 rounded-xl text-sm font-semibold"
            style={{
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            Sign in
          </button>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          AES-256-GCM · PBKDF2 (600k iterations) · Open source on GitHub
        </p>
      </section>

      {/* Stats */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div
          className="rounded-2xl p-6 sm:p-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center"
          style={{
            background: 'var(--bg-surface)',
            border: '0.5px solid var(--border)',
          }}
        >
          {[
            { label: 'Vaults created', value: stats?.users ?? 0 },
            { label: 'Items secured', value: stats?.totalItems ?? 0 },
            { label: 'Logins protected', value: stats?.logins ?? 0 },
            {
              label: 'Cards & notes',
              value: (stats?.cards ?? 0) + (stats?.notes ?? 0),
            },
          ].map((s) => (
            <div key={s.label}>
              <p
                className="text-2xl sm:text-3xl font-bold"
                style={{ color: 'var(--accent)' }}
              >
                <AnimatedCounter value={s.value} />
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
        <p
          className="text-center text-xs mt-3"
          style={{ color: 'var(--text-muted)' }}
        >
          Real numbers from this VaultX instance, updated live. Every count
          above is encrypted — we only ever see totals, never contents.
        </p>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2
          className="text-2xl font-semibold text-center mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Built for people who care about privacy
        </h2>
        <p
          className="text-sm text-center mb-10 max-w-xl mx-auto"
          style={{ color: 'var(--text-muted)' }}
        >
          Every design decision in VaultX starts from one question: does this
          require trusting us with your data? If yes, we redesign it.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-5 flex flex-col gap-2"
              style={{
                background: 'var(--bg-surface)',
                border: '0.5px solid var(--border)',
              }}
            >
              <span className="text-2xl">{f.icon}</span>
              <p
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {f.title}
              </p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--text-muted)' }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Beta notice */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div
          className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6"
          style={{
            background: 'var(--accent-subtle)',
            border: '0.5px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 40 }}>🚧</div>
          <div>
            <p
              className="text-sm font-semibold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              VaultX is in public beta
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              The core is stable and your vault is encrypted end-to-end, but the
              product is still evolving. Found a bug or have an idea? Open an
              issue on GitHub — every report helps make VaultX better for
              everyone.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <h2
          className="text-2xl font-semibold text-center mb-8"
          style={{ color: 'var(--text-primary)' }}
        >
          Common questions
        </h2>
        <div className="flex flex-col gap-3">
          {FAQS.map((faq) => (
            <FaqItem
              key={faq.q}
              q={faq.q}
              simple={faq.simple}
              technical={faq.technical}
            />
          ))}
        </div>
      </section>

      {/* Roadmap */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2
          className="text-2xl font-semibold text-center mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          What's next
        </h2>
        <p
          className="text-sm text-center mb-8"
          style={{ color: 'var(--text-muted)' }}
        >
          VaultX is actively evolving during beta. Here's what's coming:
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {ROADMAP.map((r) => (
            <div
              key={r.title}
              className="rounded-xl p-4 flex items-start gap-3"
              style={{
                background: 'var(--bg-surface)',
                border: '0.5px solid var(--border)',
              }}
            >
              <span className="text-xl">{r.icon}</span>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {r.title}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {r.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fun decorative lock animation */}
      <section className="max-w-3xl mx-auto px-6 pb-16 flex justify-center gap-6">
        {['🔐', '🔑', '🛡️', '🔒'].map((emoji, i) => (
          <span
            key={emoji}
            className="text-3xl animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, opacity: 0.6 }}
          >
            {emoji}
          </span>
        ))}
      </section>

      {/* Footer */}
      <footer
        className="px-6 py-8 text-center text-xs"
        style={{
          borderTop: '0.5px solid var(--border)',
          color: 'var(--text-muted)',
        }}
      >
        VaultX · Open source ·{' '}
        <a
          href="https://github.com/jayesh-thar/vaultx"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)' }}
        >
          GitHub
        </a>{' '}
        · Built with care for privacy
      </footer>
    </div>
  );
}
