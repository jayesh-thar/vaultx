// The raw shape of a vault item as it comes from the API (still encrypted)
export interface VaultItem {
  id: string;
  type: 'login' | 'note' | 'card';
  encrypted_data: string;
  iv: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

// After we decrypt encrypted_data — this is what's inside
export interface ItemPayload {
  title: string;
  username?: string;
  email?: string;
  password?: string;
  url?: string;
  totpSecret?: string;
  content?: string;
  cardholder?: string;
  number?: string;
  expiry?: string;
  cvv?: string;
  notes?: string;
  favorite?: boolean;
  tags?: string[];
  passwordChangedAt?: string;
}

// VaultItem + decrypted payload combined — what the popup actually uses
export interface DecryptedItem {
  id: string;
  type: 'login' | 'note' | 'card';
  category: string | null;
  created_at?: string;
  payload: ItemPayload;
}

// What chrome.storage.session holds for the active session
export interface SessionData {
  masterKey: number[]; // Uint8Array stored as number[] (storage only handles JSON)
  accessToken: string;
  refreshToken: string;
  email: string;
}
