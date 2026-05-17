import { pool } from '../../db/pool';

// Get vault belonging to user
export async function getUserVault(userId: string) {
  const result = await pool.query(
    `SELECT id, name, created_at FROM vaults WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) throw new Error('VAULT_NOT_FOUND');
  return result.rows[0];
}

// Get all non-deleted items in user's vault
export async function getVaultItems(userId: string) {
  const result = await pool.query(
    `SELECT vi.id, vi.type, vi.encrypted_data, vi.iv, vi.category, vi.created_at, vi.updated_at
     FROM vault_items vi
     JOIN vaults v ON v.id = vi.vault_id
     WHERE v.user_id = $1
     AND vi.deleted_at IS NULL
     ORDER BY vi.created_at DESC`,
    [userId]
  );

  return result.rows;
}

// Add new item to user's vault
export async function createVaultItem(
  userId: string,
  input: { type: string; encryptedData: string; iv: string; category?: string }
) {
  // First get the vault id for this user
  const vaultResult = await pool.query(
    `SELECT id FROM vaults WHERE user_id = $1`,
    [userId]
  );

  if (vaultResult.rows.length === 0) throw new Error('VAULT_NOT_FOUND');
  const vaultId = vaultResult.rows[0].id;

  const result = await pool.query(
    `INSERT INTO vault_items (vault_id, type, encrypted_data, iv, category)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, type, encrypted_data, iv, category, created_at`,
    [vaultId, input.type, input.encryptedData, input.iv, input.category || null]
  );

  return result.rows[0];
}

// Update encrypted data of existing item
// Only owner can update — we verify via JOIN with vaults
export async function updateVaultItem(
  userId: string,
  itemId: string,
  input: { encryptedData: string; iv: string; category?: string }
) {
  const result = await pool.query(
    `UPDATE vault_items vi
     SET encrypted_data = $1, iv = $2, category = $3, updated_at = NOW()
     FROM vaults v
     WHERE vi.id = $4
     AND vi.vault_id = v.id
     AND v.user_id = $5
     AND vi.deleted_at IS NULL
     RETURNING vi.id`,
    [input.encryptedData, input.iv, input.category || null, itemId, userId]
  );

  if (result.rows.length === 0) throw new Error('ITEM_NOT_FOUND');
  return result.rows[0];
}

// Soft delete — set deleted_at timestamp, don't remove row
export async function deleteVaultItem(userId: string, itemId: string) {
  const result = await pool.query(
    `UPDATE vault_items vi
     SET deleted_at = NOW()
     FROM vaults v
     WHERE vi.id = $1
     AND vi.vault_id = v.id
     AND v.user_id = $2
     AND vi.deleted_at IS NULL
     RETURNING vi.id`,
    [itemId, userId]
  );

  if (result.rows.length === 0) throw new Error('ITEM_NOT_FOUND');
}
