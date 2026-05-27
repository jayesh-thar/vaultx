import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../../db/pool';
import { redis } from '../../db/redis';
import { hashAuthKey } from '../../utils/hash';
import {
  signAccessToken,
  signRefreshToken,
  generateSecureId,
  hashToken,
} from '../../utils/jwt';
import { logAuditEvent } from '../../utils/audit';

const REFRESH_TTL = 7 * 24 * 60 * 60;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: REFRESH_TTL * 1000,
};

const oauthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const FRONTEND = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';

// ─── Step 1: Redirect to Google ───────────────────────────────────────────────
export function googleAuth(_req: Request, res: Response): void {
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
}

// ─── Step 2: Google calls back ────────────────────────────────────────────────
export async function googleCallback(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const code = req.query.code as string;
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const g = ticket.getPayload()!;
    const googleId = g.sub;
    const email = g.email!;
    const displayName = g.name ?? email.split('@')[0];
    const picture = g.picture ?? '';

    // Find existing user (by google_id OR email)
    const found = await pool.query(
      'SELECT id FROM users WHERE google_id = $1 OR email = $2 LIMIT 1',
      [googleId, email]
    );

    if (found.rows.length > 0) {
      const userId = found.rows[0].id as string;

      // Link google_id + update name/photo from Google (only if not customized)
      await pool.query(
        `UPDATE users SET
          google_id     = COALESCE(google_id, $1),
          display_name  = COALESCE(NULLIF(display_name, ''), $2),
          profile_photo = COALESCE(NULLIF(profile_photo, ''), $3)
         WHERE id = $4`,
        [googleId, displayName, picture, userId]
      );

      // Existing user → redirect to vault unlock page
      const p = new URLSearchParams({ userId, email, displayName, picture });
      res.redirect(`${FRONTEND()}/auth/google/unlock?${p}`);
    } else {
      // New user — create placeholder (crypto fields filled in setup step)
      const inserted = await pool.query(
        `INSERT INTO users
           (email, google_id, display_name, profile_photo,
            auth_hash, auth_salt, kdf_salt, kdf_params, vault_key_enc, vault_key_iv)
         VALUES ($1, $2, $3, $4, '', '', '', '{}', '', '')
         RETURNING id`,
        [email, googleId, displayName, picture]
      );
      const userId = inserted.rows[0].id as string;
      await pool.query('INSERT INTO vaults (user_id, name) VALUES ($1, $2)', [
        userId,
        'Personal Vault',
      ]);

      logAuditEvent(userId, 'google_register_started', {});
      const p = new URLSearchParams({
        userId,
        email,
        displayName,
        picture,
        isNew: 'true',
      });
      res.redirect(`${FRONTEND()}/auth/google/setup?${p}`);
    }
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${FRONTEND()}/login?error=google_failed`);
  }
}

// ─── Step 3: New user sets vault password ─────────────────────────────────────
export async function googleSetupComplete(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      userId,
      authKey,
      authSalt,
      kdfSalt,
      kdfParams,
      vaultKeyEnc,
      vaultKeyIv,
    } = req.body;

    const check = await pool.query(
      'SELECT auth_hash FROM users WHERE id = $1',
      [userId]
    );
    if (!check.rows.length) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (check.rows[0].auth_hash !== '') {
      res.status(400).json({ error: 'Vault already configured' });
      return;
    }

    const authHash = await hashAuthKey(authKey);
    await pool.query(
      `UPDATE users SET
        auth_hash = $1, auth_salt = $2, kdf_salt = $3,
        kdf_params = $4, vault_key_enc = $5, vault_key_iv = $6
       WHERE id = $7`,
      [
        authHash,
        authSalt,
        kdfSalt,
        JSON.stringify(kdfParams),
        vaultKeyEnc,
        vaultKeyIv,
        userId,
      ]
    );

    // Create session
    const sessionId = generateSecureId();
    const accessToken = signAccessToken({ userId, sessionId });
    const refreshToken = signRefreshToken({ userId, sessionId });
    const expiresAt = new Date(Date.now() + REFRESH_TTL * 1000);

    await pool.query(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, device_info, expires_at)
       VALUES ($1, $2, $3, '{}', $4)`,
      [sessionId, userId, hashToken(refreshToken), expiresAt]
    );
    await redis.setex(
      `session:${sessionId}`,
      REFRESH_TTL,
      JSON.stringify({ userId, refreshTokenHash: hashToken(refreshToken) })
    );

    logAuditEvent(userId, 'google_register_complete', {});
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.json({ accessToken, userId });
  } catch {
    res.status(500).json({ error: 'Setup failed' });
  }
}
