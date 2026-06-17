import { apiRequest } from '../lib/api';
import { deriveKeys, toHex } from '../lib/kdf';
import { decrypt, decryptBytes, encrypt } from '../lib/crypto';
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
  // masterKey stays in memory-only session storage
  await chrome.storage.session.set({
    session: { masterKey: data.masterKey, email: data.email },
  });
  // accessToken persists in local storage for refresh-on-restart
  await chrome.storage.local.set({
    persistedAuth: { accessToken: data.accessToken, email: data.email },
  });
}

async function getSession(): Promise<SessionData | null> {
  const result = await chrome.storage.session.get('session');
  const session = result.session as
    | { masterKey: number[]; email: string }
    | undefined;

  if (session?.masterKey) {
    // masterKey present in memory — fully unlocked
    const persisted = await chrome.storage.local.get('persistedAuth');
    const accessToken = persisted.persistedAuth?.accessToken;
    if (!accessToken) return null;
    return { masterKey: session.masterKey, accessToken, email: session.email };
  }

  return null;
}

async function clearSession(): Promise<void> {
  await chrome.storage.session.remove('session');
  await chrome.storage.local.remove('persistedAuth');
}

// check if we have a persisted login (browser restarted, masterKey lost)
async function hasPersistedAuth(): Promise<{ email: string } | null> {
  const persisted = await chrome.storage.local.get('persistedAuth');
  if (persisted.persistedAuth?.accessToken) {
    return { email: persisted.persistedAuth.email };
  }
  return null;
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
    case MSG.REUNLOCK:
      return handleReunlock(msg.payload);
    case 'UPSERT_CREDENTIAL':
      return handleUpsertCredential((msg as any).payload);
    case MSG.ADD_VAULT_ITEM:
      return handleAddVaultItem((msg as any).payload);
    case MSG.DELETE_VAULT_ITEM:
      return handleDeleteVaultItem((msg as any).payload);
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCheckSession(): Promise<
  CheckSessionResponse & { needsUnlock?: boolean }
> {
  const session = await getSession();
  if (session) return { isLoggedIn: true, email: session.email };

  // Browser restarted — masterKey lost but token persisted
  const persisted = await hasPersistedAuth();
  if (persisted) {
    return { isLoggedIn: false, needsUnlock: true, email: persisted.email };
  }

  return { isLoggedIn: false };
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

async function handleReunlock(payload: {
  password: string;
}): Promise<LoginResponse> {
  const persisted = await chrome.storage.local.get('persistedAuth');
  const email = persisted.persistedAuth?.email;
  const accessToken = persisted.persistedAuth?.accessToken;

  if (!email || !accessToken) {
    return { success: false, error: 'No saved session. Please log in.' };
  }

  try {
    const prelogin = await apiRequest<{
      kdfSalt: string;
      kdfParams: { iterations: number; memory: number; parallelism: number };
    }>('/api/auth/prelogin', { method: 'POST', body: { email } });

    const { vaultKey } = await deriveKeys(
      payload.password,
      prelogin.kdfSalt,
      prelogin.kdfParams
    );

    // Get current vault_key_enc/iv from profile (works even if accessToken expired —
    // apiRequest auto-refreshes on 401)
    const profileRes = await apiRequest<{
      vault_key_enc: string;
      vault_key_iv: string;
    }>('/api/user/profile', { token: accessToken });

    const masterKeyBytes = await decryptBytes(
      { ciphertext: profileRes.vault_key_enc, iv: profileRes.vault_key_iv },
      vaultKey
    );

    if (masterKeyBytes.length !== 32) {
      return { success: false, error: 'Incorrect master password' };
    }

    // Restore masterKey into memory-only session storage
    await chrome.storage.session.set({
      session: { masterKey: Array.from(masterKeyBytes), email },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Incorrect master password',
    };
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
      body: { type: 'login', encryptedData: ciphertext, iv },
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    return { success: false, error: message };
  }
}

async function handleAddVaultItem(payload: {
  type: 'login' | 'note' | 'card';
  payload: Record<string, unknown>;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Not logged in' };
  try {
    const masterKey = new Uint8Array(
      session.masterKey
    ) as Uint8Array<ArrayBuffer>;
    const category = payload.payload.category as string | undefined;
    const body: Record<string, unknown> = JSON.parse(
      JSON.stringify(payload.payload)
    );
    delete body.category;

    const { ciphertext, iv } = await encrypt(JSON.stringify(body), masterKey);

    const reqBody: Record<string, unknown> = {
      type: payload.type,
      encryptedData: ciphertext,
      iv,
    };
    if (category) reqBody.category = category;

    const res = await apiRequest<{ id?: string }>('/api/vault/items', {
      method: 'POST',
      token: session.accessToken,
      body: reqBody,
    });

    return { success: true, id: res?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save',
    };
  }
}

async function handleDeleteVaultItem(payload: {
  id: string;
}): Promise<{ success: boolean }> {
  const session = await getSession();
  if (!session) return { success: false };
  try {
    await apiRequest(`/api/vault/items/${payload.id}`, {
      method: 'DELETE',
      token: session.accessToken,
    });
    return { success: true };
  } catch {
    return { success: false };
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

async function handleSaveFormFields(payload: {
  fields: Array<{ name: string; type: string; value: string; label: string }>;
  domain: string;
  title: string;
  url: string;
  forceSave?: boolean;
}): Promise<{
  saved: boolean;
  autoSave: boolean;
  id?: string;
  title?: string;
}> {
  const session = await getSession();
  if (!session) return { saved: false, autoSave: false };

  const prefs = await chrome.storage.local.get('vaultx_autosave');
  const autoSave = prefs.vaultx_autosave !== false; // default ON

  if (!autoSave && !payload.forceSave) {
    return { saved: false, autoSave, id: undefined, title: undefined };
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
      'cardholder',
      'cardNumber',
      'expiry',
      'cvv',
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

    const isCardForm = !!standard.cardNumber && !standard.password;

    let itemPayload: Record<string, unknown>;
    let itemType: 'login' | 'card';

    if (isCardForm) {
      itemType = 'card';
      itemPayload = {
        title: payload.title || `Card — ${payload.domain}`,
        cardholder: standard.cardholder || '',
        number: standard.cardNumber || '',
        expiry: standard.expiry || '',
        cvv: standard.cvv || '',
        notes: '',
        favorite: false,
      };
    } else {
      itemType = 'login';
      itemPayload = {
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
    }

    const { ciphertext, iv } = await encrypt(
      JSON.stringify(itemPayload),
      masterKey
    );

    // For login items: upsert (update if same domain+username exists, else create)
    if (itemType === 'login') {
      const upsertRes = await handleUpsertCredential({
        fields: payload.fields,
        domain: payload.domain,
        title: payload.title,
        url: payload.url,
      });
      return {
        saved: upsertRes.saved,
        autoSave,
        id: upsertRes.id,
        title: upsertRes.title,
      };
    }

    // Cards are always new (can have multiple cards)
    const res = await apiRequest<{ id?: string }>('/api/vault/items', {
      method: 'POST',
      token: session.accessToken,
      body: { type: itemType, encryptedData: ciphertext, iv },
    });

    return {
      saved: true,
      autoSave,
      id: res?.id,
      title: (itemPayload as { title?: string }).title,
    };
  } catch (err) {
    console.error('[VaultX SW] Save form error:', err);
    return { saved: false, autoSave: false, id: undefined, title: undefined };
  }
}

async function handleUpsertCredential(payload: {
  fields: Array<{ name: string; type: string; value: string; label: string }>;
  domain: string;
  title: string;
  url: string;
}): Promise<{ saved: boolean; updated: boolean; id?: string; title?: string }> {
  const session = await getSession();
  if (!session) return { saved: false, updated: false };

  const masterKey = new Uint8Array(
    session.masterKey
  ) as Uint8Array<ArrayBuffer>;

  // Build the new payload
  const standard: Record<string, string> = {};
  const standardKeys = [
    'email',
    'username',
    'password',
    'firstName',
    'lastName',
  ];
  for (const field of payload.fields) {
    if (field.type === 'password' && !field.value) continue;
    if (standardKeys.includes(field.name)) standard[field.name] = field.value;
  }

  const newUsername = standard.username || standard.email || '';
  const newPassword = standard.password || '';

  // Fetch all existing items to check for duplicates
  const allRes = await handleGetVaultItems();
  const existing = (allRes.items ?? []).find((item) => {
    if (item.type !== 'login') return false;
    const url = item.payload.url ?? '';
    let itemDomain = '';
    try {
      itemDomain = new URL(url.startsWith('http') ? url : 'https://' + url)
        .hostname;
    } catch {}
    const sameUser =
      (item.payload.username || (item.payload as any).email || '') ===
      newUsername;
    return itemDomain === payload.domain && sameUser;
  });

  const itemPayload = {
    title: payload.title || payload.domain,
    url: payload.url,
    username: newUsername,
    email: standard.email || '',
    password: newPassword,
    notes: '',
    favorite: false,
    passwordChangedAt: new Date().toISOString(),
  };

  const { ciphertext, iv } = await encrypt(
    JSON.stringify(itemPayload),
    masterKey
  );

  try {
    if (existing) {
      // Update existing item
      await apiRequest(`/api/vault/items/${existing.id}`, {
        method: 'PUT',
        token: session.accessToken,
        body: { encryptedData: ciphertext, iv },
      });
      return {
        saved: true,
        updated: true,
        id: existing.id,
        title: itemPayload.title,
      };
    } else {
      // Create new
      const res = await apiRequest<{ id?: string }>('/api/vault/items', {
        method: 'POST',
        token: session.accessToken,
        body: { type: 'login', encryptedData: ciphertext, iv },
      });
      return {
        saved: true,
        updated: false,
        id: res?.id,
        title: itemPayload.title,
      };
    }
  } catch (err) {
    console.error('[VaultX SW] Upsert error:', err);
    return { saved: false, updated: false };
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
