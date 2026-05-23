export interface DerivedKeys {
  authKey: Uint8Array<ArrayBuffer>;
  vaultKey: Uint8Array<ArrayBuffer>;
}

export interface KdfParams {
  memory: number; // Argon2 field — send 0 for PBKDF2
  iterations: number; // used by our PBKDF2 derivation
  parallelism: number; // Argon2 field — send 1 for PBKDF2
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  memory: 0,
  iterations: 600000,
  parallelism: 1,
};

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function toHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derives authKey + vaultKey from master password + salt using PBKDF2-SHA256.
 * Outputs 64 bytes — first 32 = authKey, last 32 = vaultKey.
 * Uses native Web Crypto — no WASM, no external dependency.
 */
export async function deriveKeys(
  password: string,
  kdfSalt: string,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<DerivedKeys> {
  const subtle = window.crypto.subtle;

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive 64 bytes (512 bits) split into 2 × 32-byte keys
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromHex(kdfSalt),
      iterations: params.iterations,
      hash: 'SHA-256', // ← hardcoded, always SHA-256
    },
    keyMaterial,
    512
  );

  const hash = new Uint8Array(bits);

  return {
    authKey: hash.slice(0, 32) as Uint8Array<ArrayBuffer>,
    vaultKey: hash.slice(32, 64) as Uint8Array<ArrayBuffer>,
  };
}

/**
 * Generates a cryptographically secure random 32-byte salt.
 * Called once at registration only.
 */
export async function generateSalt(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}
