export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

const subtle = window.crypto.subtle;

async function importKey(
  keyBytes: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  return subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function toBase64(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encrypt(
  plaintext: string,
  key: Uint8Array<ArrayBuffer>
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await importKey(key);

  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );

  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
}

export async function decrypt(
  payload: EncryptedPayload,
  key: Uint8Array<ArrayBuffer>
): Promise<string> {
  const cryptoKey = await importKey(key);

  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    cryptoKey,
    fromBase64(payload.ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

export function generateVaultKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function encryptBytes(
  bytes: Uint8Array<ArrayBuffer>,
  key: Uint8Array<ArrayBuffer>
): Promise<EncryptedPayload> {
  return encrypt(toBase64(bytes), key);
}

export async function decryptBytes(
  payload: EncryptedPayload,
  key: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const b64 = await decrypt(payload, key);
  return fromBase64(b64);
}
