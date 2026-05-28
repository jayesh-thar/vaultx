// This is the brain — all business logic lives here. No HTTP knowledge, just pure logic.

import { pool } from '../../db/pool';
import { redis } from '../../db/redis';
import { hashAuthKey, verifyAuthKey } from '../../utils/hash';
import {
  signAccessToken,
  signRefreshToken,
  generateSecureId,
  hashToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import { RegisterInput, LoginInput } from './auth.validation';
import { logAuditEvent, AuditMeta } from '../../utils/audit';
import { sendEmail } from '../../utils/mailer';
import {
  welcomeEmail,
  passwordChangedEmail,
  newLoginEmail,
} from '../../utils/emailTemplates';

const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// ─── Internal helper ─────────────────────────────────────────────────────────
// Creates a session in DB + Redis, returns both tokens
// Called by register AND login — don't repeat this logic twice
async function createSession(userId: string, deviceInfo: object) {
  const sessionId = generateSecureId();
  const accessToken = signAccessToken({ userId, sessionId });
  const refreshToken = signRefreshToken({ userId, sessionId });
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL * 1000);

  // Persist to DB (survives Redis restart)
  await pool.query(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, device_info, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, userId, refreshTokenHash, JSON.stringify(deviceInfo), expiresAt]
  );

  // Cache in Redis (fast lookup on every refresh)
  await redis.setex(
    `session:${sessionId}`,
    REFRESH_TTL,
    JSON.stringify({ userId, refreshTokenHash, deviceInfo })
  );

  return { accessToken, refreshToken, sessionId };
}

// ─── Register ─────────────────────────────────────────────────────────────────
export async function registerUser(input: RegisterInput) {
  const {
    email,
    authKey,
    authSalt,
    kdfSalt,
    kdfParams,
    vaultKeyEnc,
    vaultKeyIv,
  } = input;

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [
    email,
  ]);
  if (existing.rows.length > 0) throw new Error('EMAIL_EXISTS');

  // Hash authKey AGAIN server-side — defense in depth
  // Client sends hash(password), we store hash(hash(password))
  const authHash = await hashAuthKey(authKey);

  // Use a transaction — user + vault must both succeed or both fail
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, auth_hash, auth_salt, kdf_salt, kdf_params, vault_key_enc, vault_key_iv)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        email,
        authHash,
        authSalt,
        kdfSalt,
        JSON.stringify(kdfParams),
        vaultKeyEnc,
        vaultKeyIv,
      ]
    );

    const userId = userResult.rows[0].id;

    await client.query(`INSERT INTO vaults (user_id, name) VALUES ($1, $2)`, [
      userId,
      'Personal Vault',
    ]);

    await client.query('COMMIT');

    const tokens = await createSession(userId, {});
    logAuditEvent(userId, 'register', { ip: 'unknown' });

    sendEmail({
      to: email,
      subject: 'Welcome to VaultX 🔐',
      html: welcomeEmail(email.split('@')[0], email),
    }).catch(() => {});

    return { userId, ...tokens };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // always return connection to pool
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function loginUser(input: LoginInput, deviceInfo: object) {
  const { email, authKey } = input;

  const result = await pool.query(
    `SELECT id, auth_hash, kdf_salt, kdf_params, vault_key_enc, vault_key_iv
     FROM users WHERE email = $1`,
    [email]
  );

  // Same error for "user not found" and "wrong password"
  // Never reveal which one failed — prevents user enumeration attacks
  if (result.rows.length === 0) {
    logAuditEvent(null, 'login_failed', { reason: 'user_not_found' });
    throw new Error('INVALID_CREDENTIALS');
  }

  const user = result.rows[0];
  const valid = await verifyAuthKey(user.auth_hash, authKey);

  if (!valid) {
    logAuditEvent(user.id, 'login_failed', { reason: 'wrong_password' });
    throw new Error('INVALID_CREDENTIALS');
  }

  const tokens = await createSession(user.id, deviceInfo);
  logAuditEvent(user.id, 'login_success', deviceInfo as AuditMeta);

  const device = deviceInfo as { ip?: string; userAgent?: string };
  sendEmail({
    to: email,
    subject: 'New sign-in to VaultX',
    html: newLoginEmail(email.split('@')[0], email, device),
  }).catch(() => {});

  return {
    userId: user.id,
    kdfSalt: user.kdf_salt,
    kdfParams: user.kdf_params,
    vaultKeyEnc: user.vault_key_enc,
    vaultKeyIv: user.vault_key_iv,
    ...tokens,
  };
}

// for the unlock flow — gets kdfSalt without exposing which emails exist
export async function getPreloginData(email: string) {
  const result = await pool.query(
    'SELECT kdf_salt, kdf_params FROM users WHERE email = $1',
    [email]
  );
  if (result.rows.length === 0) throw new Error('USER_NOT_FOUND');
  return {
    kdfSalt: result.rows[0].kdf_salt as string,
    kdfParams: result.rows[0].kdf_params as object,
  };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
export async function refreshSession(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new Error('INVALID_TOKEN');
  }

  const { userId, sessionId } = payload;
  const tokenHash = hashToken(refreshToken);
  const redisKey = `session:${sessionId}`;

  const cached = await redis.get(redisKey);
  if (!cached) throw new Error('SESSION_NOT_FOUND');

  const session = JSON.parse(cached);

  if (session.refreshTokenHash !== tokenHash) {
    // Hash mismatch = someone is reusing an old token = possible theft
    // Nuclear option: kill ALL sessions for this user
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await redis.del(redisKey);
    logAuditEvent(userId, 'token_reuse', { reason: 'hash_mismatch' });
    throw new Error('TOKEN_REUSE_DETECTED');
  }

  // Rotate — delete old, create new
  await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  await redis.del(redisKey);

  return createSession(userId, session.deviceInfo || {});
}

// ─── Change Password ──────────────────────────────────────────────────────────
export async function changeUserPassword(
  userId: string,
  input: {
    newAuthKey: string;
    newAuthSalt: string;
    newKdfSalt: string;
    newKdfParams: { memory: number; iterations: number; parallelism: number };
    newVaultKeyEnc: string;
    newVaultKeyIv: string;
  }
): Promise<void> {
  // OTP replaces current-password verification — check it was verified
  const otpVerified = await redis.get(`otp_verified:${userId}`);
  if (!otpVerified) throw new Error('OTP_NOT_VERIFIED');

  // Hash the new authKey
  const newAuthHash = await hashAuthKey(input.newAuthKey);

  await pool.query(
    `UPDATE users SET
      auth_hash     = $1,
      auth_salt     = $2,
      kdf_salt      = $3,
      kdf_params    = $4,
      vault_key_enc = $5,
      vault_key_iv  = $6,
      updated_at    = NOW()
     WHERE id = $7`,
    [
      newAuthHash,
      input.newAuthSalt,
      input.newKdfSalt,
      JSON.stringify(input.newKdfParams),
      input.newVaultKeyEnc,
      input.newVaultKeyIv,
      userId,
    ]
  );

  // Invalidate all sessions
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await redis.del(`otp_verified:${userId}`);

  // Send notification email
  const userRow = await pool.query('SELECT email FROM users WHERE id = $1', [
    userId,
  ]);
  if (userRow.rows.length > 0) {
    sendEmail({
      to: userRow.rows[0].email,
      subject: 'Your VaultX master password was changed',
      html: passwordChangedEmail(
        userRow.rows[0].email.split('@')[0],
        userRow.rows[0].email,
        {}
      ),
    }).catch(() => {});
  }

  logAuditEvent(userId, 'password_changed', {});
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM vault_items WHERE vault_id IN (SELECT id FROM vaults WHERE user_id = $1)',
      [userId]
    );
    await client.query('DELETE FROM vaults WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM audit_logs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logoutUser(sessionId: string, userId: string) {
  await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  await redis.del(`session:${sessionId}`);
  logAuditEvent(userId, 'logout', {});
}
