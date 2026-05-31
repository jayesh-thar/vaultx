// ─── Message Types ────────────────────────────────────────────────────────────
// All communication between popup ↔ service-worker ↔ content-script
// uses these typed messages via chrome.runtime.sendMessage.
//
// Pattern: every request has a paired *_RESULT message carrying
// { success: boolean; error?: string; data?: T }

export type MessageType =
  | 'CHECK_SESSION'
  | 'SESSION_STATUS'
  | 'LOGIN'
  | 'LOGIN_RESULT'
  | 'LOGOUT'
  | 'GET_VAULT_ITEMS'
  | 'VAULT_ITEMS_RESULT'
  | 'GET_ITEMS_FOR_DOMAIN'
  | 'ITEMS_FOR_DOMAIN_RESULT'
  | 'AUTOFILL_CREDENTIALS'
  | 'SAVE_CREDENTIALS'
  | 'SAVE_CREDENTIALS_RESULT';

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SessionStatusPayload {
  isLoggedIn: boolean;
  email?: string;
}

export interface DecryptedItem {
  id: string;
  type: 'login' | 'note' | 'card';
  category?: string;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  totp?: string;
  notes?: string;
}

export interface VaultItemsResultPayload {
  success: boolean;
  items?: DecryptedItem[];
  error?: string;
}

export interface DomainItemsPayload {
  domain: string;
}

export interface DomainItemsResultPayload {
  success: boolean;
  items?: DecryptedItem[];
  error?: string;
}

export interface AutofillPayload {
  username: string;
  password: string;
}

export interface SaveCredentialsPayload {
  title: string;
  username: string;
  password: string;
  url: string;
}

// ─── Generic message wrapper ───────────────────────────────────────────────────

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

// ─── Helper: send a message to the service worker and await the response ───────
// Usage in popup or content script:
//   const result = await sendMessage<LoginPayload, LoginResultPayload>({ type: 'LOGIN', payload: { email, password } })

export function sendMessage<TPayload = unknown, TResponse = unknown>(
  message: Message<TPayload>
): Promise<TResponse> {
  return chrome.runtime.sendMessage(message);
}
