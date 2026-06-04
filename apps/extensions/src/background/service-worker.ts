import { apiRequest } from '../lib/api';
import { deriveKeys, toHex } from '../lib/kdf';
import { decrypt, encrypt } from '../lib/crypto';
import { MSG } from '../lib/messages';
import type {
  ExtensionMessage,
  CheckSessionResponse,
  LoginResponse,
  LogoutResponse,
  GetVaultItemsResponse,
  GetItemsForDomainResponse,
  SaveCredentialsResponse,
} from '../lib/messages';
import type {
  SessionData,
  VaultItem,
  DecryptedItem,
  ItemPayload,
} from '../types';

// ─── Session Helpers ─────────────────────────────────────────────────────────
// chrome.storage.session = in-memory storage. Survives SW restarts within the
// same browser session. Cleared when browser closes. Perfect for masterKey.

async function saveSession(data: SessionData): Promise<void> {
  await chrome.storage.session.set({ session: data });
}

async function getSession(): Promise<SessionData | null> {
  const result = await chrome.storage.session.get('session');
  return (result.session as SessionData) ?? null;
}

async function clearSession(): Promise<void> {
  await chrome.storage.session.remove('session');
}

// ─── Message Router ───────────────────────────────────────────────────────────
// This is the entry point. Every message from popup or content script lands here.
// We look at msg.type and route to the right handler.

chrome.runtime.onMessage.addListener(
  (msg: ExtensionMessage, _sender, sendResponse) => {
    // IMPORTANT: To use async/await inside onMessage, you must:
    // 1. Call an async function immediately
    // 2. Return `true` — this tells Chrome "I'll call sendResponse later"
    // Without `return true`, Chrome closes the message channel immediately.

    handleMessage(msg)
      .then(sendResponse)
      .catch((err: Error) => {
        console.error('[VaultX SW] Error:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // keep channel open for async response
  }
);

async function handleMessage(msg: ExtensionMessage): Promise<unknown> {
  switch (msg.type) {
    case MSG.CHECK_SESSION:
      return handleCheckSession();
    case MSG.LOGIN:
      return handleLogin(msg.payload);
    case MSG.LOGOUT:
      return handleLogout();
    case MSG.GET_VAULT_ITEMS:
      return handleGetVaultItems();
    case MSG.GET_ITEMS_FOR_DOMAIN:
      return handleGetItemsForDomain(msg.payload);
    case MSG.SAVE_CREDENTIALS:
      return handleSaveCredentials(msg.payload);
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCheckSession(): Promise<CheckSessionResponse> {
  const session = await getSession();
  if (!session) return { isLoggedIn: false };
  return { isLoggedIn: true, email: session.email };
}

async function handleLogin(payload: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  const { email, password } = payload;

  try {
    // Step 1: Get kdfSalt from server (needed to derive keys from password)
    // Server stores kdfSalt per user — we can't derive keys without it
    const prelogin = await apiRequest<{
      kdfSalt: string;
      kdfParams: { iterations: number; memory: number; parallelism: number };
    }>('/api/auth/prelogin', { method: 'POST', body: { email } });

    // Step 2: Derive authKey + vaultKey from master password
    // This takes ~1-2 seconds (600k PBKDF2 iterations — intentional, stops brute force)
    const { authKey, vaultKey } = await deriveKeys(
      password,
      prelogin.kdfSalt,
      prelogin.kdfParams
    );

    // Step 3: Login with authKey (hex). Server never sees the raw password.
    const loginRes = await apiRequest<{
      accessToken: string;
      vaultKeyEnc: string;
      vaultKeyIv: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: { email, authKey: toHex(authKey) },
    });

    // Step 4: Decrypt masterKey using vaultKey
    // Server stores masterKey encrypted with vaultKey. We decrypt it locally.
    const masterKeyHex = await decrypt(
      { ciphertext: loginRes.vaultKeyEnc, iv: loginRes.vaultKeyIv },
      vaultKey
    );

    // Step 5: Convert masterKey hex string → Uint8Array for crypto operations
    const masterKeyBytes = new Uint8Array(
      masterKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
    );

    // Step 6: Save session to chrome.storage.session
    // Uint8Array can't be stored in JSON → convert to number[]
    await saveSession({
      masterKey: Array.from(masterKeyBytes),
      accessToken: loginRes.accessToken,
      email,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return { success: false, error: message };
  }
}

async function handleLogout(): Promise<LogoutResponse> {
  await clearSession();
  return { success: true };
}

async function handleGetVaultItems(): Promise<GetVaultItemsResponse> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Not logged in' };

  try {
    // Fetch encrypted vault items from API
    const items = await apiRequest<VaultItem[]>('/api/vault/items', {
      token: session.accessToken,
    });

    // Restore masterKey from number[] back to Uint8Array
    const masterKey = new Uint8Array(
      session.masterKey
    ) as Uint8Array<ArrayBuffer>;

    // Decrypt each item's encrypted_data using masterKey
    const decrypted: DecryptedItem[] = await Promise.all(
      items.map(async (item) => {
        const plaintext = await decrypt(
          { ciphertext: item.encrypted_data, iv: item.iv },
          masterKey
        );
        const payload = JSON.parse(plaintext) as ItemPayload;
        return {
          id: item.id,
          type: item.type,
          category: item.category,
          payload,
        };
      })
    );

    return { success: true, items: decrypted };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch vault';
    return { success: false, error: message };
  }
}

async function handleGetItemsForDomain(payload: {
  domain: string;
}): Promise<GetItemsForDomainResponse> {
  const vaultRes = await handleGetVaultItems();

  if (!vaultRes.success || !vaultRes.items) return { items: [] };

  // Filter to only login items whose saved URL matches the current domain
  const matched = vaultRes.items.filter((item) => {
    if (item.type !== 'login') return false;
    const url = item.payload.url;
    if (!url) return false;
    try {
      return new URL(url).hostname === payload.domain;
    } catch {
      return false;
    }
  });

  return { items: matched };
}

async function handleSaveCredentials(payload: {
  title: string;
  username: string;
  password: string;
  url: string;
}): Promise<SaveCredentialsResponse> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Not logged in' };

  try {
    const masterKey = new Uint8Array(
      session.masterKey
    ) as Uint8Array<ArrayBuffer>;
    const { encrypt } = await import('../lib/crypto');

    const plaintext = JSON.stringify({
      title: payload.title,
      username: payload.username,
      password: payload.password,
      url: payload.url,
    } satisfies ItemPayload);

    const { ciphertext, iv } = await encrypt(plaintext, masterKey);

    await apiRequest('/api/vault/items', {
      method: 'POST',
      token: session.accessToken,
      body: {
        type: 'login',
        encryptedData: ciphertext,
        iv,
        category: null,
      },
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    return { success: false, error: message };
  }
}
