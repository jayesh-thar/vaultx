export interface Vault {
  id: string;
  name: string;
  createdAt: string;
}

export type VaultItemType = 'login' | 'note' | 'card';

export interface VaultItem {
  id: string;
  type: VaultItemType;
  encryptedData: string;
  iv: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemInput {
  type: VaultItemType;
  encryptedData: string;
  iv: string;
  category?: string;
}

export interface UpdateItemInput {
  encryptedData: string;
  iv: string;
  category?: string;
}

// Decrypted structure — only exists client-side, never sent to server
export interface DecryptedLoginItem {
  username: string;
  password: string;
  url?: string;
  notes?: string;
}
