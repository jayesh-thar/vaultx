import { Request, Response } from 'express';
import { pool } from '../../db/pool';
import { redis } from '../../db/redis';
import { generateSecureId, hashToken } from '../../utils/jwt';
import { sendEmail } from '../../utils/mailer';
import { hashAuthKey } from '../../utils/hash';

const RESET_TTL = 15 * 60; // 15 minutes

const FRONTEND = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';

// ─── Step 1: Request reset link ───────────────────────────────────────────
export async function requestPasswordReset(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [
      normalizedEmail,
    ]);

    // Always return success — don't reveal if email exists
    if (userRow.rows.length > 0) {
      const userId = userRow.rows[0].id;

      // Generate raw token (sent in email) + hash (stored in Redis)
      const rawToken = generateSecureId();
      const tokenHash = hashToken(rawToken);

      await redis.setex(`pwd_reset:${tokenHash}`, RESET_TTL, userId);

      const resetUrl = `${FRONTEND()}/reset-password?token=${rawToken}`;

      await sendEmail({
        to: normalizedEmail,
        subject: 'VaultX — Reset your master password',
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #10b981;">Reset your VaultX master password</h2>
            <p>Click the link below to reset your master password. This link expires in 15 minutes.</p>
            <p><a href="${resetUrl}" style="display:inline-block; padding: 10px 20px; background: #10b981; color: #fff; border-radius: 8px; text-decoration: none;">Reset Password</a></p>
            <p style="color: #666; font-size: 12px;">If you didn't request this, ignore this email. Your account is safe.</p>
            <p style="color: #666; font-size: 12px;">⚠ Resetting your password will permanently delete your encrypted vault items, since VaultX cannot decrypt them without your old password (zero-knowledge architecture).</p>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({
      message:
        'If an account exists with this email, a reset link has been sent.',
    });
  } catch {
    res.status(500).json({ error: 'Failed to process request' });
  }
}

// ─── Step 2: Verify token (called when reset page loads) ──────────────────
export async function verifyResetToken(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ valid: false });
      return;
    }

    const tokenHash = hashToken(token);
    const userId = await redis.get(`pwd_reset:${tokenHash}`);

    res.json({ valid: !!userId });
  } catch {
    res.status(500).json({ valid: false });
  }
}

// ─── Step 3: Complete reset — set new password ─────────────────────────────
export async function completePasswordReset(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      token,
      newAuthKey,
      newAuthSalt,
      newKdfSalt,
      newKdfParams,
      newVaultKeyEnc,
      newVaultKeyIv,
    } = req.body;

    if (!token || !newAuthKey) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const tokenHash = hashToken(token);
    const userId = await redis.get(`pwd_reset:${tokenHash}`);

    if (!userId) {
      res
        .status(400)
        .json({ error: 'Reset link expired or invalid. Request a new one.' });
      return;
    }

    const newAuthHash = await hashAuthKey(newAuthKey);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Zero-knowledge: can't migrate encrypted items without old password — delete them
      await client.query(
        'DELETE FROM vault_items WHERE vault_id IN (SELECT id FROM vaults WHERE user_id = $1)',
        [userId]
      );

      await client.query(
        `UPDATE users SET
          auth_hash = $1, auth_salt = $2, kdf_salt = $3,
          kdf_params = $4, vault_key_enc = $5, vault_key_iv = $6,
          updated_at = NOW()
         WHERE id = $7`,
        [
          newAuthHash,
          newAuthSalt,
          newKdfSalt,
          JSON.stringify(newKdfParams),
          newVaultKeyEnc,
          newVaultKeyIv,
          userId,
        ]
      );

      // Terminate all sessions — force re-login everywhere
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // One-time use — delete token
    await redis.del(`pwd_reset:${tokenHash}`);

    // Notify user
    const emailRow = await pool.query('SELECT email FROM users WHERE id = $1', [
      userId,
    ]);
    if (emailRow.rows.length) {
      const { passwordChangedEmail } =
        await import('../../utils/emailTemplates');
      sendEmail({
        to: emailRow.rows[0].email,
        subject: 'VaultX — Password reset complete',
        html: passwordChangedEmail(
          emailRow.rows[0].email.split('@')[0],
          emailRow.rows[0].email,
          {}
        ),
      }).catch(() => {});
    }

    res.json({
      message:
        'Password reset successful. Your vault has been cleared. Please log in with your new password.',
    });
  } catch {
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
}
