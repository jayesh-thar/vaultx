import { Request, Response } from 'express';
// REPLACE the two broken import lines with:
import {
  registerUser,
  loginUser,
  refreshSession,
  logoutUser,
  changeUserPassword,
  getPreloginData,
  deleteUserAccount,
} from './auth.service';
import { registerSchema, loginSchema } from './auth.validation';
import { pool } from '../../db/pool';
import { redis } from '../../db/redis';
import { sendEmail } from '../../utils/mailer';
import {
  forgotPasswordEmail,
  passwordChangedEmail,
} from '../../utils/emailTemplates';
import {
  generateSecureId,
  hashToken,
  signAccessToken,
  signRefreshToken,
} from '../../utils/jwt';

const COOKIE_OPTIONS = {
  httpOnly: true, // JS can't read this cookie
  secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
  sameSite: 'strict' as const, // no cross-site sending
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const result = await registerUser(parsed.data);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res
      .status(201)
      .json({ accessToken: result.accessToken, userId: result.userId });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    res.status(500).json({ error: 'Registration failed' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const deviceInfo = { ip: req.ip, userAgent: req.headers['user-agent'] };
    const result = await loginUser(parsed.data, deviceInfo);

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.json({
      accessToken: result.accessToken,
      userId: result.userId,
      kdfSalt: result.kdfSalt,
      kdfParams: result.kdfParams,
      vaultKeyEnc: result.vaultKeyEnc,
      vaultKeyIv: result.vaultKeyIv,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    res.status(500).json({ error: 'Login failed' });
  }
}

export async function prelogin(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    const data = await getPreloginData(email);
    res.json(data);
  } catch {
    // Return plausible fake to prevent email enumeration
    res.json({
      kdfSalt: 'notfound',
      kdfParams: { iterations: 600000, memory: 0, parallelism: 1 },
    });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const tokens = await refreshSession(token);
    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);
    res.json({ accessToken: tokens.accessToken });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'TOKEN_REUSE_DETECTED') {
      res
        .status(401)
        .json({ error: 'Security violation — all sessions terminated' });
      return;
    }
    res.status(401).json({ error: 'Session expired' });
  }
}

export async function changePassword(
  req: Request,
  res: Response
): Promise<void> {
  try {
    await changeUserPassword(req.user!.userId, req.body);
    res.json({ message: 'Password changed successfully' });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'INVALID_CREDENTIALS') {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }
      if (err.message === 'USER_NOT_FOUND') {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    }
    if (err instanceof Error && err.message === 'OTP_NOT_VERIFIED') {
      res
        .status(403)
        .json({ error: 'Please verify your identity with OTP first' });
      return;
    }
    res.status(500).json({ error: 'Failed to change password' });
  }
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, device_info, created_at, expires_at FROM sessions
       WHERE user_id = $1
         AND expires_at > NOW()
         AND created_at > NOW() - INTERVAL '1 day'
       ORDER BY created_at DESC`,
      [req.user!.userId]
    );
    res.json({ sessions: result.rows, currentSessionId: req.user!.sessionId });
  } catch {
    res.status(500).json({ error: 'Failed to list sessions' });
  }
}

export async function terminateSession(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { sessionId } = req.params;
    if (sessionId === req.user!.sessionId) {
      res.status(400).json({ error: "Can't terminate current session" });
      return;
    }
    await pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [
      sessionId,
      req.user!.userId,
    ]);
    await redis.del(`session:${sessionId}`);
    res.json({ message: 'Session terminated' });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
}

export async function terminateAllOtherSessions(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const currentId = req.user!.sessionId;
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id != $2', [
      req.user!.userId,
      currentId,
    ]);
    res.json({ message: 'All other sessions terminated' });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
}

export async function forgotPasswordSendOTP(
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

    // Check email exists (don't reveal if it does)
    const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [
      normalizedEmail,
    ]);

    if (userRow.rows.length > 0) {
      const userId = userRow.rows[0].id;
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await redis.setex(
        `forgot_otp:${userId}`,
        600,
        JSON.stringify({ code, attempts: 0 })
      );

      await sendEmail({
        to: normalizedEmail,
        subject: `${code} — VaultX password reset`,
        html: forgotPasswordEmail(normalizedEmail, code),
      });
    }

    // Always return success (don't reveal if email exists)
    const masked = normalizedEmail.replace(/(.{1}).+(@.+)/, '$1***$2');
    res.json({
      message: 'If an account exists, a code was sent.',
      maskedEmail: masked,
    });
  } catch {
    res.status(500).json({ error: 'Failed to send reset code' });
  }
}

export async function forgotPasswordReset(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      email,
      code,
      newAuthKey,
      newAuthSalt,
      newKdfSalt,
      newKdfParams,
      newVaultKeyEnc,
      newVaultKeyIv,
    } = req.body;

    if (!email || !code || !newAuthKey) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [
      normalizedEmail,
    ]);
    if (!userRow.rows.length) {
      res.status(400).json({ error: 'Invalid reset code' });
      return;
    }

    const userId = userRow.rows[0].id;
    const raw = await redis.get(`forgot_otp:${userId}`);
    if (!raw) {
      res.status(400).json({ error: 'Reset code expired. Request a new one.' });
      return;
    }

    const { code: stored, attempts } = JSON.parse(raw);
    if (attempts >= 3) {
      await redis.del(`forgot_otp:${userId}`);
      res.status(400).json({ error: 'Too many attempts. Request a new code.' });
      return;
    }

    if (code !== stored) {
      await redis.set(
        `forgot_otp:${userId}`,
        JSON.stringify({ code: stored, attempts: attempts + 1 }),
        'KEEPTTL'
      );
      res.status(400).json({ error: 'Incorrect code. Try again.' });
      return;
    }

    // Code correct — delete OTP
    await redis.del(`forgot_otp:${userId}`);

    // Delete ALL vault items (zero-knowledge: can't migrate without old password)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update credentials with new password
      const { hashAuthKey } = await import('../../utils/hash.js');
      const newAuthHash = await hashAuthKey(newAuthKey);

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

      // Terminate all sessions
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Send confirmation email
    sendEmail({
      to: normalizedEmail,
      subject: 'VaultX — Password reset complete',
      html: passwordChangedEmail(
        normalizedEmail.split('@')[0],
        normalizedEmail,
        {}
      ),
    }).catch(() => {});

    res.json({
      message: 'Password reset successful. Your vault has been cleared.',
    });
  } catch {
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
}

export async function deleteAccount(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { authKey } = req.body;
    if (!authKey) {
      res.status(400).json({ error: 'Master password required' });
      return;
    }

    await deleteUserAccount(req.user!.userId, authKey);
    res.clearCookie('refreshToken');
    res.json({ message: 'Account deleted' });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'INVALID_CREDENTIALS') {
        res.status(401).json({ error: 'Incorrect master password' });
        return;
      }
    }
    res.status(500).json({ error: 'Failed to delete account' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    await logoutUser(req.user!.sessionId, req.user!.userId);
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch {
    res.status(500).json({ error: 'Logout failed' });
  }
}

export async function cardPinExists(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT card_pin_hash FROM users WHERE id = $1',
      [req.user!.userId]
    );
    res.json({ exists: !!result.rows[0]?.card_pin_hash });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
}

export async function setCardPin(req: Request, res: Response): Promise<void> {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      res.status(400).json({ error: 'PIN must be 4-8 digits' });
      return;
    }
    const bcrypt = await import('bcryptjs');
    const pinHash = await bcrypt.hash(pin, 12);
    await pool.query('UPDATE users SET card_pin_hash = $1 WHERE id = $2', [
      pinHash,
      req.user!.userId,
    ]);
    const userRow = await pool.query('SELECT email FROM users WHERE id = $1', [
      req.user!.userId,
    ]);
    if (userRow.rows.length) {
      const { email } = userRow.rows[0];
      const { sendEmail } = await import('../../utils/mailer.js');
      const { cardPinSetEmail } = await import('../../utils/emailTemplates.js');
      sendEmail({
        to: email,
        subject: '🔒 VaultX — Card PIN successfully set',
        html: cardPinSetEmail(email.split('@')[0], email),
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    console.error('setCardPin error:', err);
    res.status(500).json({ error: 'Failed to set PIN' });
  }
}

export async function verifyCardPin(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { pin } = req.body;
    if (!pin) {
      res.status(400).json({ error: 'PIN required' });
      return;
    }

    const result = await pool.query(
      'SELECT card_pin_hash FROM users WHERE id = $1',
      [req.user!.userId]
    );
    const hash = result.rows[0]?.card_pin_hash;
    if (!hash) {
      res.status(404).json({ error: 'No PIN set' });
      return;
    }

    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(pin, hash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect PIN' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('verifyCardPin error:', err);
    res.status(500).json({ error: 'Failed' });
  }
}

export async function resetCardPin(req: Request, res: Response): Promise<void> {
  try {
    const { authKey } = req.body;
    if (!authKey) {
      res.status(400).json({ error: 'Master password required' });
      return;
    }

    const userRow = await pool.query(
      'SELECT auth_hash FROM users WHERE id = $1',
      [req.user!.userId]
    );
    if (!userRow.rows.length) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { verifyAuthKey } = await import('../../utils/hash.js');
    const valid = await verifyAuthKey(userRow.rows[0].auth_hash, authKey);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect master password' });
      return;
    }

    await pool.query('UPDATE users SET card_pin_hash = NULL WHERE id = $1', [
      req.user!.userId,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error('resetCardPin error:', err);
    res.status(500).json({ error: 'Failed to reset PIN' });
  }
}

export async function resetCardPinWithOtp(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      res.status(400).json({ error: 'PIN must be 4-8 digits' });
      return;
    }

    // Check OTP was verified (reuse existing otp_verified Redis key)
    const otpVerified = await redis.get(`otp_verified:${req.user!.userId}`);
    if (!otpVerified) {
      res
        .status(403)
        .json({ error: 'Please verify your identity with OTP first' });
      return;
    }

    const bcrypt = await import('bcryptjs');
    const pinHash = await bcrypt.hash(pin, 12);
    await pool.query('UPDATE users SET card_pin_hash = $1 WHERE id = $2', [
      pinHash,
      req.user!.userId,
    ]);
    await redis.del(`otp_verified:${req.user!.userId}`);

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reset PIN' });
  }
}

export async function googleExtensionAuth(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { code, redirectUri } = req.body;
    if (!code || !redirectUri) {
      res.status(400).json({ error: 'Missing code or redirectUri' });
      return;
    }

    // Exchange auth code for Google tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenData.access_token) {
      res
        .status(400)
        .json({ error: tokenData.error ?? 'Failed to exchange code' });
      return;
    }

    // Get user info from Google
    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    const googleUser = (await userRes.json()) as {
      email: string;
      name?: string;
      picture?: string;
      id: string;
    };

    if (!googleUser.email) {
      res.status(400).json({ error: 'Could not get email from Google' });
      return;
    }

    const email = googleUser.email.toLowerCase().trim();
    const deviceInfo = { ip: req.ip, userAgent: req.headers['user-agent'] };

    // Check if user exists
    const existing = await pool.query(
      'SELECT id, kdf_salt, kdf_params, vault_key_enc, vault_key_iv FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      const { createSession } = await import('./auth.service.js');
      const tokens = await createSession(user.id, deviceInfo);

      const rawParams = user.kdf_params;
      const kdfParams =
        typeof rawParams === 'string' ? JSON.parse(rawParams) : rawParams;

      res.json({
        isNewUser: false,
        accessToken: tokens.accessToken,
        userId: user.id,
        email,
        kdfSalt: user.kdf_salt,
        kdfParams,
        vaultKeyEnc: user.vault_key_enc,
        vaultKeyIv: user.vault_key_iv,
      });
    } else {
      // New user — return flag, extension will redirect to web app setup
      res.json({
        isNewUser: true,
        email,
        name: googleUser.name,
      });
    }
  } catch (err) {
    console.error('googleExtensionAuth error:', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
}

// Google users: re-establish session after entering vault password.
// No authKey verification — Google OAuth already proved identity.
// We just need to issue a new access/refresh token and return vault encryption data.
export async function googleUnlockSession(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }

    const userRow = await pool.query(
      'SELECT id, email, kdf_salt, kdf_params, vault_key_enc, vault_key_iv, google_id FROM users WHERE id = $1',
      [userId]
    );

    if (userRow.rows.length === 0 || !userRow.rows[0].google_id) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userRow.rows[0];

    const sessionId = generateSecureId();
    const accessToken = signAccessToken({ userId: user.id, sessionId });
    const refreshToken = signRefreshToken({ userId: user.id, sessionId });
    const refreshTokenHash = hashToken(refreshToken);

    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, device_info, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [
        user.id,
        refreshTokenHash,
        JSON.stringify({ userAgent: req.headers['user-agent'] }),
      ]
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      userId: user.id,
      email: user.email,
      kdfSalt: user.kdf_salt,
      kdfParams:
        typeof user.kdf_params === 'string'
          ? JSON.parse(user.kdf_params)
          : user.kdf_params,
      vaultKeyEnc: user.vault_key_enc,
      vaultKeyIv: user.vault_key_iv,
    });
  } catch (err) {
    console.error('googleUnlockSession error:', err);
    res.status(500).json({ error: 'Failed to unlock' });
  }
}

export async function forgotPasswordWithRecoveryKey(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      email,
      newAuthKey,
      newAuthSalt,
      newKdfSalt,
      newKdfParams,
      newVaultKeyEnc,
      newVaultKeyIv,
    } = req.body;
    if (!email || !newAuthKey || !newVaultKeyEnc) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [
      normalizedEmail,
    ]);
    if (!userRow.rows.length) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const userId = userRow.rows[0].id;
    const { hashAuthKey } = await import('../../utils/hash.js');
    const newAuthHash = await hashAuthKey(newAuthKey);

    await pool.query(
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

    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

    res.json({
      message: 'Password reset successful. Your vault has been preserved.',
    });
  } catch {
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
}

// Also need: endpoint to fetch recovery_key_enc/iv + kdfSalt for client-side decryption
export async function getRecoveryData(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { email } = req.query;
    const userRow = await pool.query(
      'SELECT recovery_key_enc, recovery_key_iv FROM users WHERE email = $1',
      [String(email).toLowerCase().trim()]
    );
    if (!userRow.rows.length || !userRow.rows[0].recovery_key_enc) {
      res
        .status(404)
        .json({ error: 'No recovery key set up for this account' });
      return;
    }
    res.json(userRow.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
}
