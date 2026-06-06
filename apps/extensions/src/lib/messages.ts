// Every message has a 'type' string. Payload and response vary per message.
// This file is the single source of truth for all inter-sandbox communication.

import type { DecryptedItem } from '../types';

// --- Message Types (string constants) ---
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
} as const;

// --- Request shapes (what the sender sends) ---
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

export interface CheckHasCardsRequest {
  type: typeof MSG.CHECK_HAS_CARDS;
}
export interface CheckHasCardsResponse {
  hasCards: boolean;
}

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
  | CheckHasCardsRequest;

// --- Response shapes (what the service worker sends back) ---
export interface CheckSessionResponse {
  isLoggedIn: boolean;
  email?: string;
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
