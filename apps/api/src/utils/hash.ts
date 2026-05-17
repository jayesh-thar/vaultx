import argon2 from 'argon2';
import dotenv from 'dotenv';

dotenv.config();

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: Number(process.env.ARGON2_MEMORY_COST) || 65536, // 64MB
  timeCost: Number(process.env.ARGON2_TIME_COST) || 3,
  parallelism: Number(process.env.ARGON2_PARALLELISM) || 1,
};

// Used on registration — hash the auth_key server-side before storing
export async function hashAuthKey(authKey: string): Promise<string> {
  return argon2.hash(authKey, ARGON2_OPTIONS);
}

// Used on login — verify incoming auth_key against stored hash
export async function verifyAuthKey(
  storedHash: string,
  incomingAuthKey: string
): Promise<boolean> {
  return argon2.verify(storedHash, incomingAuthKey);
}
