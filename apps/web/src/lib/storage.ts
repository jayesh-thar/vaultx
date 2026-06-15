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

// Keep these for backward compat — used in kdf derivation
export function saveKdfLocally(
  _email: string, // (The _ prefix tells TypeScript "I know this is unused, that's intentional.")
  kdfSalt: string,
  kdfParams: KdfParams
): void {
  const existing = loadSession();
  if (existing) {
    saveSession({ ...existing, kdfSalt, kdfParams });
  }
}

export function loadKdfLocally(
  email: string
): { kdfSalt: string; kdfParams: KdfParams } | null {
  const session = loadSession();
  if (!session || session.email !== email.toLowerCase()) return null;
  return { kdfSalt: session.kdfSalt, kdfParams: session.kdfParams };
}
