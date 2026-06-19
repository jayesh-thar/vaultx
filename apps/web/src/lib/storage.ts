import type { KdfParams } from './kdf';

export interface StoredSession {
  email: string;
  userId: string;
  kdfSalt: string;
  kdfParams: KdfParams;
  vaultKeyEnc: string;
  vaultKeyIv: string;
  loginAt?: number;
}

const SESSION_KEY = 'vx_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

export function saveSession(data: StoredSession): void {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ ...data, loginAt: Date.now() })
  );
}

export function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const session = JSON.parse(raw) as StoredSession;
  if (session.loginAt && Date.now() - session.loginAt > SESSION_MAX_AGE_MS) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  return session;
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function clearAllLocalVaultData(): void {
  // Full wipe — used on "delete account" or "forget this device"
  Object.keys(localStorage)
    .filter((k) => k.startsWith('vx_'))
    .forEach((k) => localStorage.removeItem(k));
}

// Keep these for backward compat — used in kdf derivation
export function saveKdfLocally(
  email: string,
  kdfSalt: string,
  kdfParams: KdfParams
): void {
  const key = `vx_kdf_${email}`;
  localStorage.setItem(
    key,
    JSON.stringify({ kdfSalt, kdfParams, savedAt: Date.now() })
  );

  // Cap to 3 most recent accounts on this device — evict oldest
  const kdfKeys = Object.keys(localStorage).filter((k) =>
    k.startsWith('vx_kdf_')
  );
  if (kdfKeys.length > 3) {
    const entries = kdfKeys
      .map((k) => {
        try {
          const v = JSON.parse(localStorage.getItem(k) ?? '{}');
          return { key: k, savedAt: v.savedAt ?? 0 };
        } catch {
          return { key: k, savedAt: 0 };
        }
      })
      .sort((a, b) => a.savedAt - b.savedAt);
    const toRemove = entries.slice(0, entries.length - 3);
    toRemove.forEach((e) => localStorage.removeItem(e.key));
  }
}

export function loadKdfLocally(
  email: string
): { kdfSalt: string; kdfParams: KdfParams } | null {
  const session = loadSession();
  if (!session || session.email !== email.toLowerCase()) return null;
  return { kdfSalt: session.kdfSalt, kdfParams: session.kdfParams };
}
