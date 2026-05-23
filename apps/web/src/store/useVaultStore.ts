import { create } from 'zustand';
import { setAccessToken } from '../lib/api';

// Minimal shape matching the backend vault_items table
// Can switch to @vaultx/shared import once workspace is configured
export interface VaultItem {
  id: string;
  type: string;
  encrypted_data: string; // ← snake_case (matches actual API response)
  iv: string;
  category?: string;
  created_at: string; // ← snake_case
  updated_at: string; // ← snake_case
}

interface VaultState {
  userId: string | null;
  accessToken: string | null;
  vaultKey: Uint8Array<ArrayBuffer> | null;
  items: VaultItem[];

  setAuth: (userId: string, token: string) => void;
  setVaultKey: (key: Uint8Array<ArrayBuffer>) => void;
  setItems: (items: VaultItem[]) => void;
  clearSession: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  userId: null,
  accessToken: null,
  vaultKey: null,
  items: [],

  setAuth: (userId, token) => {
    setAccessToken(token); // syncs to api.ts interceptor
    set({ userId, accessToken: token });
  },

  setVaultKey: (key) => set({ vaultKey: key }),

  setItems: (items) => set({ items }),

  clearSession: () => {
    setAccessToken(null);
    set({ userId: null, accessToken: null, vaultKey: null, items: [] });
  },
}));
