// AES-256-GCM encryption using the Web Crypto API.
// Works in: popup (window.crypto), service worker (self.crypto), content script (window.crypto).
// globalThis.crypto covers all three without needing to branch.

const ALGO = 'AES-GCM';
const IV_LENGTH = 12; // bytes — standard for AES-GCM

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGO },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

// ─── String encrypt/decrypt ───────────────────────────────────────────────────

export async function encrypt(
  plaintext: string,
  key: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cryptoKey = await importKey(key);
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuf = await globalThis.crypto.subtle.encrypt(
    { name: ALGO, iv },
    cryptoKey,
    encoded
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuf)),
    iv: bytesToHex(iv),
  };
}

export async function decrypt(
  { ciphertext, iv }: { ciphertext: string; iv: string },
  key: Uint8Array
): Promise<string> {
  const cryptoKey = await importKey(key);

  const plaintextBuf = await globalThis.crypto.subtle.decrypt(
    { name: ALGO, iv: hexToBytes(iv) },
    cryptoKey,
    hexToBytes(ciphertext)
  );

  return new TextDecoder().decode(plaintextBuf);
}

// ─── Bytes encrypt/decrypt (for vault key) ───────────────────────────────────

export async function encryptBytes(
  data: Uint8Array,
  key: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cryptoKey = await importKey(key);

  const ciphertextBuf = await globalThis.crypto.subtle.encrypt(
    { name: ALGO, iv },
    cryptoKey,
    data
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuf)),
    iv: bytesToHex(iv),
  };
}

export async function decryptBytes(
  { ciphertext, iv }: { ciphertext: string; iv: string },
  key: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await importKey(key);

  const plaintextBuf = await globalThis.crypto.subtle.decrypt(
    { name: ALGO, iv: hexToBytes(iv) },
    cryptoKey,
    hexToBytes(ciphertext)
  );

  return new Uint8Array(plaintextBuf);
}

// ─── Generate a random 32-byte vault/master key ───────────────────────────────

export function generateVaultKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}
