import type { Message, LoginPayload } from '../lib/messages';
import { deriveKeys, toHex } from '../lib/kdf';
import { decryptBytes } from '../lib/crypto';
import { apiPost } from '../lib/api';

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true;
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

async function handleLogin(payload: LoginPayload) {
  const { email, password } = payload;

  try {
    // Step 1: prelogin — get kdfSalt
    const preloginRes = await apiPost<{
      kdfSalt: string;
      kdfParams: { iterations: number; memory: number; parallelism: number };
    }>('/api/auth/prelogin', { email });

    console.log('[VaultX SW] prelogin response:', preloginRes);

    // Step 2: PBKDF2 — derive authKey + vaultKey (~1-2 seconds)
    const { authKey, vaultKey } = await deriveKeys(
      password,
      preloginRes.kdfSalt,
      preloginRes.kdfParams
    );

    // Step 3: login with authKey
    const loginRes = await apiPost<Record<string, string>>('/api/auth/login', {
      email,
      authKey: toHex(authKey),
    });

    // Log the full response so we can see the exact field names
    console.log('[VaultX SW] login response keys:', Object.keys(loginRes));
    console.log('[VaultX SW] login response:', loginRes);

    // Step 4: Resolve field names — handle both camelCase and snake_case
    const accessToken = loginRes.accessToken ?? loginRes.access_token;
    const vaultKeyEnc = loginRes.vaultKeyEnc ?? loginRes.vault_key_enc;
    const vaultKeyIv = loginRes.vaultKeyIv ?? loginRes.vault_key_iv;

    if (!accessToken || !vaultKeyEnc || !vaultKeyIv) {
      console.error('[VaultX SW] Missing fields in login response:', loginRes);
      throw new Error(
        `Login response missing fields. Got: ${Object.keys(loginRes).join(', ')}`
      );
    }

    // Step 5: Decrypt masterKey
    const masterKey = await decryptBytes(
      { ciphertext: vaultKeyEnc, iv: vaultKeyIv },
      vaultKey
    );

    // Step 6: Store in session (in-memory, clears when browser closes)
    await chrome.storage.session.set({
      masterKey: Array.from(masterKey),
      accessToken,
      email,
    });

    console.log('[VaultX SW] Login successful for:', email);
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
