// Key Derivation: PBKDF2-SHA256 → 64 bytes split into authKey + vaultKey.
// Mirrors the web app's kdf.ts exactly — same salt, same params, same output.

export interface KdfParams {
  iterations: number;
  memory: number; // unused for PBKDF2, kept for API parity
  parallelism: number; // unused for PBKDF2, kept for API parity
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  iterations: 600_000,
  memory: 0,
  parallelism: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

export function generateSalt(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

// ─── deriveKeys ───────────────────────────────────────────────────────────────
// password  → user's master password (plaintext)
// kdfSalt   → hex string from server (/api/auth/prelogin)
// kdfParams → { iterations } from server
//
// Returns:
//   authKey  [0..32]  → hex → sent to server for Argon2id hashing
//   vaultKey [32..64] → kept in RAM → decrypts the vault key

export async function deriveKeys(
  password: string,
  kdfSalt: string,
  kdfParams: KdfParams = DEFAULT_KDF_PARAMS
): Promise<{ authKey: Uint8Array; vaultKey: Uint8Array }> {
  const enc = new TextEncoder();

  // Import password as raw key material
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive 64 bytes from PBKDF2
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(kdfSalt),
      iterations: kdfParams.iterations,
    },
    keyMaterial,
    512 // 64 bytes = 512 bits
  );

  const derived = new Uint8Array(derivedBits);

  return {
    authKey: derived.slice(0, 32),
    vaultKey: derived.slice(32, 64),
  };
}
