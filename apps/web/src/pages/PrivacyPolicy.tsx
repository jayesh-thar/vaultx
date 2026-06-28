import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: '#F5F5F4',
      }}
    >
      {/* Nav */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(10,10,11,0.9)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          to="/"
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: '#F5F5F4',
            textDecoration: 'none',
          }}
        >
          🔐 VaultX
        </Link>
        <Link
          to="/"
          style={{ fontSize: 13, color: '#6B6B70', textDecoration: 'none' }}
        >
          ← Back
        </Link>
      </header>

      <main
        style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 96px' }}
      >
        <h1
          style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px',
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: '#6B6B70', margin: '0 0 40px' }}>
          Last updated: June 2026
        </p>

        {[
          {
            title: '1. What VaultX is',
            body: `VaultX is a zero-knowledge encrypted password manager. "Zero-knowledge" means your master password and vault contents never leave your device in readable form. All encryption and decryption happens locally in your browser using the Web Crypto API before any data is transmitted to our servers.`,
          },
          {
            title: '2. What we store',
            body: `On our servers we store only:\n• Encrypted vault data (ciphertext) — we cannot decrypt this without your master password, which we never receive\n• A doubly-hashed auth credential (PBKDF2 → Argon2id) for login verification only\n• Your email address, for account identification and transactional emails\n• Encrypted key material (vault_key_enc, recovery_key_enc) — both encrypted client-side before upload\n• Anonymized vault statistics (item counts only, never contents)\n\nWe do not store your master password. We do not store your recovery key. We do not store any plaintext vault content.`,
          },
          {
            title: '3. What we cannot do',
            body: `Because of the zero-knowledge design, VaultX cannot:\n• Read your passwords, notes, or card numbers\n• Recover your vault if you forget your master password and lose your recovery key\n• Provide readable vault contents to law enforcement — we can only provide encrypted blobs that are useless without your master password`,
          },
          {
            title: '4. Browser extension',
            body: `The VaultX browser extension:\n• Reads form fields on pages you visit to enable autofill and credential capture — this happens locally and field values are never sent to VaultX servers in plaintext\n• Stores your master key in chrome.storage.session (cleared when you close the browser — Chrome security requirement)\n• Stores only an access token in chrome.storage.local for session persistence across browser restarts\n• Does not read page content unrelated to login or registration forms`,
          },
          {
            title: '5. Third-party services',
            body: `VaultX uses:\n• Neon (PostgreSQL) — stores encrypted data. SOC 2 Type 2 compliant.\n• Upstash (Redis) — stores temporary session tokens and OTP codes that expire within minutes.\n• Resend — delivers transactional emails (recovery key, OTP codes). Email content does not include vault data.\n• Have I Been Pwned — breach checking uses k-anonymity. Only the first 5 hex characters of a SHA-1 hash are ever sent. HIBP never receives your actual password.\n• Google OAuth — optional login. If used, we receive your email address and display name from Google.`,
          },
          {
            title: '6. Data retention',
            body: `Your encrypted vault data is retained until you delete your account. When you delete your account, all encrypted data, audit logs, and sessions are permanently deleted. We may retain your email briefly for fraud prevention.`,
          },
          {
            title: '7. Security',
            body: `All data in transit uses TLS 1.2+. Vault items are encrypted with AES-256-GCM. Master password derivation uses PBKDF2-SHA256 with 600,000 iterations. Authentication hashes use Argon2id. Access tokens rotate on every refresh. Refresh token reuse detection invalidates all sessions immediately.`,
          },
          {
            title: '8. Your rights',
            body: `You may at any time:\n• Export all your vault data (Settings → Data → Export)\n• Delete your account and all associated data (Settings → Account → Delete Account)\n• Request information about data we hold by opening a GitHub issue\n\nVaultX is open source — you can audit exactly what the client code does with your data at github.com/jayesh-thar/vaultx.`,
          },
          {
            title: '9. Changes',
            body: `Material changes to this policy will be announced via a notice on the VaultX landing page and by email where possible. Continued use after such notice constitutes acceptance.`,
          },
          {
            title: '10. Contact',
            body: `VaultX is an open-source project. For privacy questions, open an issue at github.com/jayesh-thar/vaultx/issues.`,
          },
        ].map(({ title, body }) => (
          <section key={title} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#F3CA63',
                margin: '0 0 10px',
              }}
            >
              {title}
            </h2>
            <div
              style={{
                background: '#141416',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '16px 20px',
              }}
            >
              {body.split('\n').map((line, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.7,
                    color: '#A8A8AC',
                    margin: line === '' ? '6px 0' : '0 0 2px',
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          </section>
        ))}

        <div
          style={{
            borderRadius: 12,
            padding: '16px 20px',
            background: 'rgba(232,179,57,0.08)',
            border: '1px solid rgba(232,179,57,0.2)',
            marginTop: 40,
          }}
        >
          <p
            style={{
              fontSize: 13.5,
              color: '#A8A8AC',
              margin: 0,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: '#F3CA63' }}>TL;DR:</strong> We store only
            encrypted blobs. We cannot read your passwords. Your master password
            never leaves your device. You can delete everything at any time.
            VaultX is open source — verify it yourself.
          </p>
        </div>
      </main>

      <footer
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '24px',
          textAlign: 'center',
          fontSize: 12,
          color: '#6B6B70',
        }}
      >
        VaultX ·{' '}
        <a
          href="https://github.com/jayesh-thar/vaultx"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#F3CA63', textDecoration: 'none' }}
        >
          GitHub
        </a>{' '}
        · Open source, zero-knowledge
      </footer>
    </div>
  );
}
