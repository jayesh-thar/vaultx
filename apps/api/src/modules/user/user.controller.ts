import { Request, Response } from 'express';
import { pool } from '../../db/pool';

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT email, display_name, profile_photo, created_at FROM users WHERE id = $1',
      [req.user!.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

export async function updateProfile(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { displayName, profilePhoto } = req.body;

    // Limit photo size — base64 of 200KB image ≈ 270KB string
    if (profilePhoto && profilePhoto.length > 300000) {
      res.status(400).json({ error: 'Photo too large. Max 200KB.' });
      return;
    }

    await pool.query(
      `UPDATE users SET
        display_name  = COALESCE($1, display_name),
        profile_photo = COALESCE($2, profile_photo),
        updated_at    = NOW()
       WHERE id = $3`,
      [displayName ?? null, profilePhoto ?? null, req.user!.userId]
    );
    res.json({ message: 'Profile updated' });
  } catch {
    res.status(500).json({ error: 'Failed to update profile' });
  }
}
