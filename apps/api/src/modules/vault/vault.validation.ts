import { z } from 'zod';

export const createItemSchema = z.object({
  type: z.enum(['login', 'note', 'card']),
  encryptedData: z.string().min(1), // ciphertext — server never decrypts this
  iv: z.string().min(1), // AES-GCM IV — unique per item
  category: z.string().max(100).optional(),
});

export const updateItemSchema = z.object({
  encryptedData: z.string().min(1),
  iv: z.string().min(1),
  category: z.string().max(100).optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
