import type { KdfParams } from './kdf';

export interface StoredSession {
  email: string;
  userId: string;
  kdfSalt: string;
  kdfParams: KdfParams;
  vaultKeyEnc: string;
  vaultKeyIv: string;
}

const SESSION_KEY = 'vx_session';

export function saveSession(data: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as StoredSession) : null;
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// Keep these for backward compat — used in kdf derivation
export function saveKdfLocally(
  email: string,
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
