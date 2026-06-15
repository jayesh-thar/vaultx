import type { DecryptedItem } from '../types';

export const MSG = {
  CHECK_SESSION: 'CHECK_SESSION',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  GET_VAULT_ITEMS: 'GET_VAULT_ITEMS',
  GET_ITEMS_FOR_DOMAIN: 'GET_ITEMS_FOR_DOMAIN',
  AUTOFILL_CREDENTIALS: 'AUTOFILL_CREDENTIALS',
  SAVE_CREDENTIALS: 'SAVE_CREDENTIALS',
  CHECK_CARD_PIN_EXISTS: 'CHECK_CARD_PIN_EXISTS',
  SET_CARD_PIN: 'SET_CARD_PIN',
  VERIFY_CARD_PIN: 'VERIFY_CARD_PIN',
  CHECK_HAS_CARDS: 'CHECK_HAS_CARDS',
  GOOGLE_AUTH: 'GOOGLE_AUTH',
  GOOGLE_UNLOCK: 'GOOGLE_UNLOCK',
  SAVE_FORM_FIELDS: 'SAVE_FORM_FIELDS',
  GET_PENDING_CREDENTIAL: 'GET_PENDING_CREDENTIAL',
  CLEAR_PENDING_CREDENTIAL: 'CLEAR_PENDING_CREDENTIAL',
  SAVE_PENDING_CREDENTIAL: 'SAVE_PENDING_CREDENTIAL',
  REUNLOCK: 'REUNLOCK',
  ADD_VAULT_ITEM: 'ADD_VAULT_ITEM',
  DELETE_VAULT_ITEM: 'DELETE_VAULT_ITEM',
} as const;

// ── Request shapes ─────────────────────────────────────────────────────────
export interface CheckSessionRequest {
  type: typeof MSG.CHECK_SESSION;
}
export interface LoginRequest {
  type: typeof MSG.LOGIN;
  payload: { email: string; password: string };
}
export interface LogoutRequest {
  type: typeof MSG.LOGOUT;
}
export interface GetVaultItemsRequest {
  type: typeof MSG.GET_VAULT_ITEMS;
}
export interface GetItemsForDomainRequest {
  type: typeof MSG.GET_ITEMS_FOR_DOMAIN;
  payload: { domain: string };
}
export interface SaveCredentialsRequest {
  type: typeof MSG.SAVE_CREDENTIALS;
  payload: { title: string; username: string; password: string; url: string };
}
export interface CheckCardPinExistsRequest {
  type: typeof MSG.CHECK_CARD_PIN_EXISTS;
}
export interface SetCardPinRequest {
  type: typeof MSG.SET_CARD_PIN;
  payload: { pin: string };
}
export interface VerifyCardPinRequest {
  type: typeof MSG.VERIFY_CARD_PIN;
  payload: { pin: string };
}
export interface CheckHasCardsRequest {
  type: typeof MSG.CHECK_HAS_CARDS;
}
export interface GoogleAuthRequest {
  type: typeof MSG.GOOGLE_AUTH;
}
export interface GoogleUnlockRequest {
  type: typeof MSG.GOOGLE_UNLOCK;
  payload: { password: string };
}
export interface ReunlockRequest {
  type: typeof MSG.REUNLOCK;
  payload: { password: string };
}
export interface SaveFormFieldsRequest {
  type: typeof MSG.SAVE_FORM_FIELDS;
  payload: {
    fields: Array<{ name: string; type: string; value: string; label: string }>;
    domain: string;
    title: string;
    url: string;
    forceSave?: boolean;
  };
}
export interface GetPendingCredentialRequest {
  type: typeof MSG.GET_PENDING_CREDENTIAL;
}
export interface ClearPendingCredentialRequest {
  type: typeof MSG.CLEAR_PENDING_CREDENTIAL;
}
export interface SavePendingCredentialRequest {
  type: typeof MSG.SAVE_PENDING_CREDENTIAL;
  payload: {
    fields: Array<{ name: string; type: string; value: string; label: string }>;
    domain: string;
    title: string;
    url: string;
  };
}

export interface AddVaultItemRequest {
  type: typeof MSG.ADD_VAULT_ITEM;
  payload: {
    type: 'login' | 'note' | 'card';
    payload: Record<string, unknown>;
  };
}
export interface DeleteVaultItemRequest {
  type: typeof MSG.DELETE_VAULT_ITEM;
  payload: { id: string };
}
export interface AddVaultItemResponse {
  success: boolean;
  id?: string;
  error?: string;
}
export interface DeleteVaultItemResponse {
  success: boolean;
}

// ── Union — ALL messages must be here ──────────────────────────────────────
export type ExtensionMessage =
  | CheckSessionRequest
  | LoginRequest
  | LogoutRequest
  | GetVaultItemsRequest
  | GetItemsForDomainRequest
  | SaveCredentialsRequest
  | CheckCardPinExistsRequest
  | SetCardPinRequest
  | VerifyCardPinRequest
  | CheckHasCardsRequest
  | GoogleAuthRequest
  | GoogleUnlockRequest
  | SaveFormFieldsRequest
  | GetPendingCredentialRequest
  | ClearPendingCredentialRequest
  | SavePendingCredentialRequest
  | ReunlockRequest
  | AddVaultItemRequest
  | DeleteVaultItemRequest;

// ── Response shapes ────────────────────────────────────────────────────────
export interface CheckSessionResponse {
  isLoggedIn: boolean;
  email?: string;
  needsUnlock?: boolean;
}
export interface LoginResponse {
  success: boolean;
  error?: string;
}
export interface LogoutResponse {
  success: boolean;
}
export interface GetVaultItemsResponse {
  success: boolean;
  items?: DecryptedItem[];
  error?: string;
}
export interface GetItemsForDomainResponse {
  items: DecryptedItem[];
}
export interface SaveCredentialsResponse {
  success: boolean;
  error?: string;
}
export interface CheckCardPinExistsResponse {
  exists: boolean;
}
export interface SetCardPinResponse {
  success: boolean;
  error?: string;
}
export interface VerifyCardPinResponse {
  success: boolean;
  error?: string;
}
export interface CheckHasCardsResponse {
  hasCards: boolean;
}
export interface GoogleAuthResponse {
  success: boolean;
  isNewUser?: boolean;
  needsMasterPassword?: boolean;
  email?: string;
  error?: string;
}
export interface GoogleUnlockResponse {
  success: boolean;
  error?: string;
}
export interface SaveFormFieldsResponse {
  saved: boolean;
  autoSave: boolean;
}
