import { Request, Response } from 'express';
import { createShare, consumeShare } from './share.service';

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { encryptedPayload, expiresInHours = 24 } = req.body;
    if (!encryptedPayload) {
      res.status(400).json({ error: 'Missing payload' });
      return;
    }
    if (expiresInHours < 1 || expiresInHours > 168) {
      res.status(400).json({ error: 'Expiry must be 1–168 hours' });
      return;
    }
    const id = await createShare(encryptedPayload, expiresInHours);
    res.json({ id });
  } catch {
    res.status(500).json({ error: 'Failed to create share' });
  }
}

export async function retrieve(req: Request, res: Response): Promise<void> {
  try {
    const payload = await consumeShare(req.params.id);
    if (!payload) {
      res
        .status(404)
        .json({ error: 'Share not found, expired, or already viewed' });
      return;
    }
    res.json({ encryptedPayload: payload });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve share' });
  }
}
