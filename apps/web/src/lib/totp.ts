// Pure Web Crypto TOTP — no external library needed

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/\s|=/g, '');
  let bits = 0,
    value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function hmacSha1(
  keyBytes: Uint8Array,
  message: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer, // ← cast fixes the type error
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    message.buffer as ArrayBuffer
  );
  return new Uint8Array(sig);
}

export interface TOTPResult {
  code: string; // e.g. "123456"
  formatted: string; // e.g. "123 456"
  secondsRemaining: number;
  progress: number; // 0–1 for progress bar
}

export async function generateTOTP(
  secret: string,
  period = 30
): Promise<TOTPResult> {
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / period);
  const secondsRemaining = period - (now % period);

  const keyBytes = base32Decode(secret);

  // Counter as 8-byte big-endian
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const hmac = await hmacSha1(keyBytes, msg);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const otp =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;

  const code = otp.toString().padStart(6, '0');
  return {
    code,
    formatted: `${code.slice(0, 3)} ${code.slice(3)}`,
    secondsRemaining,
    progress: secondsRemaining / period,
  };
}

export function isValidTOTPSecret(secret: string): boolean {
  try {
    const decoded = base32Decode(secret.trim());
    return decoded.length >= 10; // valid secrets are at least 80 bits
  } catch {
    return false;
  }
}
