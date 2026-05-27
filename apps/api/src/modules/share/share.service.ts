import { pool } from '../../db/pool';

export async function createShare(
  encryptedPayload: string,
  expiresInHours: number
): Promise<string> {
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  const result = await pool.query(
    'INSERT INTO shares (encrypted_payload, expires_at) VALUES ($1, $2) RETURNING id',
    [encryptedPayload, expiresAt]
  );
  return result.rows[0].id as string;
}

export async function consumeShare(id: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT encrypted_payload FROM shares
     WHERE id = $1 AND expires_at > NOW()`,
    [id]
  );
  if (result.rows.length === 0) return null;

  // One-time: delete immediately after retrieval
  await pool.query('DELETE FROM shares WHERE id = $1', [id]);
  return result.rows[0].encrypted_payload as string;
}
