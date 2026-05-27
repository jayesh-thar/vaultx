import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface SharedData {
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
}

export default function ShareView() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<
    'loading' | 'decrypting' | 'done' | 'error'
  >('loading');
  const [data, setData] = useState<SharedData | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // Extract key from URL fragment
        const fragment = window.location.hash.slice(1);
        if (!fragment) {
          setState('error');
          setErrorMsg('Invalid share link — missing key');
          return;
        }

        // Fetch encrypted payload
        const res = await fetch(
          `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api/share/${id}`
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setState('error');
          setErrorMsg(err.error ?? 'Share not found or already viewed');
          return;
        }
        const { encryptedPayload } = await res.json();

        setState('decrypting');

        // Reconstruct key from base64 fragment
        const keyBytes = Uint8Array.from(atob(fragment), (c) =>
          c.charCodeAt(0)
        ) as Uint8Array<ArrayBuffer>;

        // Decrypt
        const { ciphertext, iv } = JSON.parse(encryptedPayload);
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyBytes,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );
        const decrypted = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)),
          },
          cryptoKey,
          Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0))
        );
        const text = new TextDecoder().decode(decrypted);
        setData(JSON.parse(text));
        setState('done');
      } catch {
        setState('error');
        setErrorMsg('Failed to decrypt. The link may be corrupted.');
      }
    }
    if (id) load();
  }, [id]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#0E0E0E' }}
    >
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: '#0D2818' }}
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
          <span style={{ color: '#F0F0F0', fontWeight: 500, fontSize: 16 }}>
            VaultX
          </span>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: '#141414', border: '0.5px solid #2A2A2A' }}
        >
          {state === 'loading' || state === 'decrypting' ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div
                className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                style={{
                  borderColor: '#10B981',
                  borderTopColor: 'transparent',
                }}
              />
              <p style={{ color: '#666', fontSize: 14 }}>
                {state === 'loading'
                  ? 'Loading secure share...'
                  : 'Decrypting...'}
              </p>
            </div>
          ) : state === 'error' ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p style={{ fontSize: 32 }}>🔒</p>
              <p style={{ color: '#F0F0F0', fontWeight: 500 }}>
                Share unavailable
              </p>
              <p style={{ color: '#666', fontSize: 13, textAlign: 'center' }}>
                {errorMsg}
              </p>
            </div>
          ) : data ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium"
                  style={{ background: '#0D2818', color: '#10B981' }}
                >
                  {(data.title ?? 'X').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p
                    style={{ color: '#F0F0F0', fontWeight: 500, fontSize: 15 }}
                  >
                    {data.title}
                  </p>
                  {data.url && (
                    <a
                      href={data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#666', fontSize: 12 }}
                    >
                      {data.url}
                    </a>
                  )}
                </div>
              </div>

              <div
                style={{
                  borderTop: '0.5px solid #2A2A2A',
                  paddingTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {data.username && (
                  <div>
                    <p style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>
                      Username
                    </p>
                    <p style={{ color: '#F0F0F0', fontSize: 14 }}>
                      {data.username}
                    </p>
                  </div>
                )}

                <div>
                  <p style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>
                    Password
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#1C1C1C',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontFamily: 'monospace',
                        color: '#F0F0F0',
                        letterSpacing: showPassword ? 1 : 4,
                      }}
                    >
                      {showPassword ? data.password : '••••••••••••'}
                    </span>
                    <button
                      onClick={() => setShowPassword((p) => !p)}
                      style={{ color: '#666', fontSize: 12, cursor: 'pointer' }}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(data.password ?? '');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 3000);
                  }}
                  style={{
                    background: copied ? '#059669' : '#10B981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {copied ? '✓ Copied to clipboard!' : 'Copy password'}
                </button>

                {data.notes && (
                  <div>
                    <p style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>
                      Notes
                    </p>
                    <p style={{ color: '#A0A0A0', fontSize: 13 }}>
                      {data.notes}
                    </p>
                  </div>
                )}
              </div>

              <p
                style={{
                  color: '#444',
                  fontSize: 11,
                  textAlign: 'center',
                  marginTop: 16,
                }}
              >
                This link has been consumed and is no longer valid.
              </p>
            </>
          ) : null}
        </div>

        <p
          style={{
            color: '#333',
            fontSize: 11,
            textAlign: 'center',
            marginTop: 16,
          }}
        >
          Shared securely via VaultX · Zero-knowledge encryption
        </p>
      </div>
    </div>
  );
}
