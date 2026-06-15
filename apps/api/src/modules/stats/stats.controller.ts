import { Request, Response } from 'express';
import { pool } from '../../db/pool';

export async function getStats(_req: Request, res: Response): Promise<void> {
  try {
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');

    const itemsResult = await pool.query(
      `SELECT type, COUNT(*) as count FROM vault_items WHERE deleted_at IS NULL GROUP BY type`
    );

    const breakdown: Record<string, number> = { login: 0, note: 0, card: 0 };
    for (const row of itemsResult.rows) {
      breakdown[row.type] = parseInt(row.count, 10);
    }

    const totalItems = breakdown.login + breakdown.note + breakdown.card;

    res.json({
      users: parseInt(usersResult.rows[0].count, 10),
      totalItems,
      logins: breakdown.login,
      notes: breakdown.note,
      cards: breakdown.card,
    });
  } catch {
    // Fail soft — landing page shouldn't break if this errors
    res.json({ users: 0, totalItems: 0, logins: 0, notes: 0, cards: 0 });
  }
}
