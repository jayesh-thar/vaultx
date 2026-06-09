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
  VerifyCardPinResponse,
  SetCardPinResponse,
  CheckCardPinExistsResponse,
  CheckHasCardsResponse,
  GoogleAuthResponse,
  GoogleUnlockResponse,
} from '../lib/messages';
import type {
  SessionData,
  VaultItem,
  DecryptedItem,
  ItemPayload,
} from '../types';

chrome.alarms.create('auto-lock-check', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'auto-lock-check') return;

  const r = await chrome.storage.session.get('lastActivity');
  const lastActivity = r.lastActivity as number | undefined;

  if (!lastActivity) return;

  const inactiveMs = Date.now() - lastActivity;
  const fifteenMin = 15 * 60 * 1000;

  if (inactiveMs > fifteenMin) {
    await clearSession();
    console.log('[VaultX] Auto-locked due to inactivity');
  }
});

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
    case MSG.CHECK_CARD_PIN_EXISTS:
      return handleCheckCardPinExists();
    case MSG.SET_CARD_PIN:
      return handleSetCardPin(msg.payload);
    case MSG.VERIFY_CARD_PIN:
      return handleVerifyCardPin(msg.payload);
    case MSG.CHECK_HAS_CARDS:
      return handleCheckHasCards();
    case MSG.GOOGLE_AUTH:
      return handleGoogleAuth();
    case MSG.GOOGLE_UNLOCK:
      return handleGoogleUnlock(msg.payload);
    case MSG.SAVE_FORM_FIELDS:
      return handleSaveFormFields((msg as any).payload);
    case MSG.GET_PENDING_CREDENTIAL:
      return getPendingCredential();
    case MSG.CLEAR_PENDING_CREDENTIAL:
      await chrome.storage.session.remove('pendingCredential');
      return { success: true };
    case MSG.SAVE_PENDING_CREDENTIAL:
      await savePendingCredential((msg as any).payload);
      return { success: true };
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
    const prelogin = await apiRequest<{
      kdfSalt: string;
      kdfParams: { iterations: number; memory: number; parallelism: number };
    }>('/api/auth/prelogin', { method: 'POST', body: { email } });

    const { authKey, vaultKey } = await deriveKeys(
      password,
      prelogin.kdfSalt,
      prelogin.kdfParams
    );

    const loginRes = await apiRequest<{
      accessToken: string;
      vaultKeyEnc: string;
      vaultKeyIv: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: { email, authKey: toHex(authKey) },
    });

    // Decrypt masterKey — result is a base64 string (44 chars = 32 bytes)
    const masterKeyDecrypted = await decrypt(
      { ciphertext: loginRes.vaultKeyEnc, iv: loginRes.vaultKeyIv },
      vaultKey
    );

    // Convert base64 string → Uint8Array (32 bytes for AES-256)
    const binary = atob(masterKeyDecrypted);
    const masterKeyBytes = new Uint8Array(
      binary.length
    ) as Uint8Array<ArrayBuffer>;
    for (let i = 0; i < binary.length; i++) {
      masterKeyBytes[i] = binary.charCodeAt(i);
    }

    if (masterKeyBytes.length !== 32) {
      return {
        success: false,
        error: `masterKey wrong length: ${masterKeyBytes.length}`,
      };
    }

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

  // Check if online
  if (!navigator.onLine) {
    return {
      success: false,
      error: 'You are offline. Connect to the internet and try again.',
    };
  }

  try {
    const res = await apiRequest<VaultItem[] | { items: VaultItem[] }>(
      '/api/vault/items',
      { token: session.accessToken }
    );

    // Handle both { items: [...] } and plain [...] response shapes
    const items: VaultItem[] = Array.isArray(res)
      ? res
      : ((res as { items: VaultItem[] }).items ?? []);

    const uniqueItems = Array.from(
      new Map(items.map((i) => [i.id, i])).values()
    );

    const masterKey = new Uint8Array(
      session.masterKey
    ) as Uint8Array<ArrayBuffer>;

    const decrypted: DecryptedItem[] = await Promise.all(
      uniqueItems.map(async (item) => {
        const plaintext = await decrypt(
          { ciphertext: item.encrypted_data, iv: item.iv },
          masterKey
        );
        const payload = JSON.parse(plaintext) as ItemPayload;
        return {
          id: item.id,
          type: item.type,
          category: item.category,
          created_at: item.created_at,
          payload,
        };
      })
    );
    await chrome.storage.session.set({ lastActivity: Date.now() });
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

    // REMOVE this line → const { encrypt } = await import('../lib/crypto');
    // encrypt is already imported at top of file

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
      body: { type: 'login', encryptedData: ciphertext, iv, category: null },
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    return { success: false, error: message };
  }
}

async function handleCheckCardPinExists(): Promise<CheckCardPinExistsResponse> {
  const session = await getSession();
  if (!session) return { exists: false };
  try {
    const res = await apiRequest<{ exists: boolean }>(
      '/api/auth/card-pin/exists',
      { token: session.accessToken }
    );
    return { exists: res.exists };
  } catch {
    return { exists: false };
  }
}

async function handleSetCardPin(payload: {
  pin: string;
}): Promise<SetCardPinResponse> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Not logged in' };
  try {
    await apiRequest('/api/auth/card-pin/set', {
      method: 'POST',
      token: session.accessToken,
      body: { pin: payload.pin },
    });
    // Cache PIN verified state for 5 minutes in session
    await chrome.storage.session.set({
      cardPinVerifiedAt: Date.now(),
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed',
    };
  }
}

async function handleVerifyCardPin(payload: {
  pin: string;
}): Promise<VerifyCardPinResponse> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Not logged in' };
  try {
    await apiRequest('/api/auth/card-pin/verify', {
      method: 'POST',
      token: session.accessToken,
      body: { pin: payload.pin },
    });
    // Cache verified timestamp — cards stay open for 5 min
    await chrome.storage.session.set({
      cardPinVerifiedAt: Date.now(),
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed',
    };
  }
}

async function handleCheckHasCards(): Promise<CheckHasCardsResponse> {
  const vaultRes = await handleGetVaultItems();
  if (!vaultRes.success || !vaultRes.items) return { hasCards: false };
  return { hasCards: vaultRes.items.some((i) => i.type === 'card') };
}

declare const __GOOGLE_CLIENT_ID__: string;
const GOOGLE_CLIENT_ID = __GOOGLE_CLIENT_ID__;

async function handleGoogleAuth(): Promise<GoogleAuthResponse> {
  try {
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    // Opens Google consent popup — user selects account
    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (url) => {
          if (chrome.runtime.lastError || !url) {
            reject(new Error(chrome.runtime.lastError?.message ?? 'Cancelled'));
          } else {
            resolve(url);
          }
        }
      );
    });

    const code = new URL(responseUrl).searchParams.get('code');
    if (!code) throw new Error('No auth code received from Google');

    // Send code to our backend
    const result = await apiRequest<{
      isNewUser: boolean;
      accessToken?: string;
      email?: string;
      kdfSalt?: string;
      kdfParams?: { iterations: number; memory: number; parallelism: number };
      vaultKeyEnc?: string;
      vaultKeyIv?: string;
    }>('/api/auth/google/extension', {
      method: 'POST',
      body: { code, redirectUri },
    });

    if (result.isNewUser) {
      // Store email temporarily — show registration form in popup
      await chrome.storage.session.set({ pendingGoogleEmail: result.email });
      return { success: true, isNewUser: true, email: result.email };
    }

    // Existing Google user — store partial session, ask for master password
    await chrome.storage.session.set({
      pendingGoogleSession: {
        accessToken: result.accessToken,
        email: result.email,
        kdfSalt: result.kdfSalt,
        kdfParams: result.kdfParams,
        vaultKeyEnc: result.vaultKeyEnc,
        vaultKeyIv: result.vaultKeyIv,
      },
    });

    return {
      success: true,
      isNewUser: false,
      needsMasterPassword: true,
      email: result.email,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Google auth failed',
    };
  }
}

async function handleGoogleUnlock(payload: {
  password: string;
}): Promise<GoogleUnlockResponse> {
  try {
    const r = await chrome.storage.session.get('pendingGoogleSession');
    const pending = r.pendingGoogleSession as
      | {
          accessToken: string;
          email: string;
          kdfSalt: string;
          kdfParams: {
            iterations: number;
            memory: number;
            parallelism: number;
          };
          vaultKeyEnc: string;
          vaultKeyIv: string;
        }
      | undefined;

    if (!pending)
      return {
        success: false,
        error: 'Session expired. Try Google login again.',
      };

    const { vaultKey } = await deriveKeys(
      payload.password,
      pending.kdfSalt,
      pending.kdfParams
    );

    const masterKeyDecrypted = await decrypt(
      { ciphertext: pending.vaultKeyEnc, iv: pending.vaultKeyIv },
      vaultKey
    );

    const binary = atob(masterKeyDecrypted);
    const masterKeyBytes = new Uint8Array(
      binary.length
    ) as Uint8Array<ArrayBuffer>;
    for (let i = 0; i < binary.length; i++)
      masterKeyBytes[i] = binary.charCodeAt(i);

    if (masterKeyBytes.length !== 32) {
      return { success: false, error: 'Incorrect master password' };
    }

    await saveSession({
      masterKey: Array.from(masterKeyBytes),
      accessToken: pending.accessToken!,
      email: pending.email!,
    });
    await chrome.storage.session.remove('pendingGoogleSession');
    return { success: true };
  } catch {
    return { success: false, error: 'Incorrect master password' };
  }
}

async function handleSaveFormFields(payload: {
  fields: Array<{ name: string; type: string; value: string; label: string }>;
  domain: string;
  title: string;
  url: string;
  forceSave?: boolean;
}): Promise<{ saved: boolean; autoSave: boolean }> {
  const session = await getSession();
  if (!session) return { saved: false, autoSave: false };

  const prefs = await chrome.storage.local.get('vaultx_autosave');
  const autoSave = prefs.vaultx_autosave === true;

  if (!autoSave && !payload.forceSave) {
    return { saved: false, autoSave: false };
  }

  try {
    const masterKey = new Uint8Array(
      session.masterKey
    ) as Uint8Array<ArrayBuffer>;

    // Map standard fields
    const standard: Record<string, string> = {};
    const customFields: Array<{
      id: string;
      label: string;
      value: string;
      type: string;
    }> = [];

    const standardKeys = [
      'email',
      'username',
      'password',
      'firstName',
      'lastName',
      'phone',
      'address',
      'city',
      'zipCode',
      'country',
      'birthdate',
    ];

    for (const field of payload.fields) {
      if (field.type === 'password' && !field.value) continue;
      if (standardKeys.includes(field.name)) {
        standard[field.name] = field.value;
      } else {
        customFields.push({
          id: crypto.randomUUID(),
          label: field.label || field.name,
          value: field.value,
          type: field.type === 'password' ? 'password' : 'text',
        });
      }
    }

    const itemPayload = {
      title: payload.title || payload.domain,
      url: payload.url,
      username: standard.username || standard.email || '',
      email: standard.email || '',
      password: standard.password || '',
      notes: '',
      favorite: false,
      passwordChangedAt: new Date().toISOString(),
      customFields: customFields.length > 0 ? customFields : undefined,
    };

    const { ciphertext, iv } = await encrypt(
      JSON.stringify(itemPayload),
      masterKey
    );

    await apiRequest('/api/vault/items', {
      method: 'POST',
      token: session.accessToken,
      body: { type: 'login', encryptedData: ciphertext, iv, category: null },
    });

    return { saved: true, autoSave };
  } catch (err) {
    console.error('[VaultX SW] Save form error:', err);
    return { saved: false, autoSave: false };
  }
}

async function savePendingCredential(payload: {
  fields: Array<{ name: string; type: string; value: string; label: string }>;
  domain: string;
  title: string;
  url: string;
}): Promise<void> {
  await chrome.storage.session.set({
    pendingCredential: {
      ...payload,
      savedAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    },
  });
}

async function getPendingCredential() {
  const r = await chrome.storage.session.get('pendingCredential');
  const pending = r.pendingCredential as
    | {
        fields: any[];
        domain: string;
        title: string;
        url: string;
        savedAt: number;
        expiresAt: number;
      }
    | undefined;

  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    await chrome.storage.session.remove('pendingCredential');
    return null;
  }
  return pending;
}
