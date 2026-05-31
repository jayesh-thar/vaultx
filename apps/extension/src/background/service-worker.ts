// Service Worker — background brain of the extension.
// Handles all auth and vault operations.
// MV3 SW can restart anytime → NEVER store masterKey in a JS variable.
// Always read/write chrome.storage.session.

import type { Message, LoginPayload } from '../lib/messages';
import { deriveKeys, toHex } from '../lib/kdf';
import { decryptBytes } from '../lib/crypto';
import { apiPost } from '../lib/api';

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; // tells Chrome we'll respond asynchronously
  }
);

async function handleMessage(message: Message): Promise<unknown> {
  console.log('[VaultX SW] received:', message.type);
  switch (message.type) {
    case 'CHECK_SESSION':
      return handleCheckSession();
    case 'LOGIN':
      return handleLogin(message.payload as LoginPayload);
    case 'LOGOUT':
      return handleLogout();
    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ─── CHECK_SESSION ────────────────────────────────────────────────────────────

async function handleCheckSession() {
  const session = await chrome.storage.session.get(['masterKey', 'email']);
  const isLoggedIn =
    Array.isArray(session.masterKey) && session.masterKey.length === 32;

  return {
    isLoggedIn,
    email: (session.email as string) ?? null,
  };
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// Full zero-knowledge login flow — mirrors the web app exactly:
//   1. prelogin → get kdfSalt from server
//   2. PBKDF2(password, kdfSalt) → authKey + vaultKey
//   3. POST /login with authKey
//   4. AES-256-GCM decrypt vaultKeyEnc using vaultKey → masterKey
//   5. Store masterKey + accessToken in chrome.storage.session

async function handleLogin(payload: LoginPayload) {
  const { email, password } = payload;

  try {
    // 1. Get kdfSalt (server looks up the user's salt by email)
    const preloginRes = await apiPost<{
      kdfSalt: string;
      kdfParams: { iterations: number; memory: number; parallelism: number };
    }>('/api/auth/prelogin', { email });

    // 2. Derive authKey + vaultKey from master password
    //    This is the expensive PBKDF2 step (600k iterations — takes ~1-2s)
    const { authKey, vaultKey } = await deriveKeys(
      password,
      preloginRes.kdfSalt,
      preloginRes.kdfParams
    );

    // 3. Login — server Argon2id-hashes authKey and compares to stored auth_hash
    const loginRes = await apiPost<{
      accessToken: string;
      vaultKeyEnc: string;
      vaultKeyIv: string;
      userId: string;
    }>('/api/auth/login', {
      email,
      authKey: toHex(authKey),
    });

    // 4. Decrypt masterKey
    //    vaultKeyEnc was AES-256-GCM encrypted with vaultKey on the web app
    //    Same vaultKey derived here → can decrypt
    const masterKey = await decryptBytes(
      { ciphertext: loginRes.vaultKeyEnc, iv: loginRes.vaultKeyIv },
      vaultKey
    );

    // 5. Persist to session storage
    //    Uint8Array is not JSON-serializable → convert to number[]
    //    chrome.storage.session is in-memory; cleared when browser closes
    await chrome.storage.session.set({
      masterKey: Array.from(masterKey),
      accessToken: loginRes.accessToken,
      email,
    });

    return { success: true };
  } catch (err) {
    console.error('[VaultX SW] Login error:', err);
    return { success: false, error: (err as Error).message };
  }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

async function handleLogout() {
  await chrome.storage.session.clear();
  return { success: true };
}

console.log('[VaultX] Service worker started');
