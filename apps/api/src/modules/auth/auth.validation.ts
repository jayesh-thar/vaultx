import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  authKey: z.string().min(64), // hex string from client-side Argon2
  authSalt: z.string().min(1),
  kdfSalt: z.string().min(1),
  kdfParams: z.object({
    memory: z.number(),
    iterations: z.number(),
    parallelism: z.number(),
  }),
  vaultKeyEnc: z.string().min(1), // encrypted vault key
  vaultKeyIv: z.string().min(1), // IV used to encrypt vault key
});

export const loginSchema = z.object({
  email: z.string().email(),
  authKey: z.string().min(64),
});

// ADD this interface and schema
export interface ChangePasswordInput {
  currentAuthKey: string;
  newAuthKey: string;
  newAuthSalt: string;
  newKdfSalt: string;
  newKdfParams: { memory: number; iterations: number; parallelism: number };
  newVaultKeyEnc: string;
  newVaultKeyIv: string;
}

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
