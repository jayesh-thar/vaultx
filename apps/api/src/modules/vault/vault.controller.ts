import { Request, Response } from 'express';
import {
  getUserVault,
  getVaultItems,
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
} from './vault.service';
import { createItemSchema, updateItemSchema } from './vault.validation';

export async function getVault(req: Request, res: Response): Promise<void> {
  try {
    const vault = await getUserVault(req.user!.userId);
    res.json(vault);
  } catch {
    res.status(404).json({ error: 'Vault not found' });
  }
}

export async function getItems(req: Request, res: Response): Promise<void> {
  try {
    const items = await getVaultItems(req.user!.userId);
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
}

export async function createItem(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const item = await createVaultItem(req.user!.userId, {
      type: parsed.data.type,
      encryptedData: parsed.data.encryptedData,
      iv: parsed.data.iv,
      category: parsed.data.category,
    });

    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: 'Failed to create item' });
  }
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  try {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const item = await updateVaultItem(req.user!.userId, req.params.id, {
      encryptedData: parsed.data.encryptedData,
      iv: parsed.data.iv,
      category: parsed.data.category,
    });

    res.json(item);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ITEM_NOT_FOUND') {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to update item' });
  }
}

export async function deleteItem(req: Request, res: Response): Promise<void> {
  try {
    await deleteVaultItem(req.user!.userId, req.params.id);
    res.json({ message: 'Item deleted' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ITEM_NOT_FOUND') {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete item' });
  }
}
