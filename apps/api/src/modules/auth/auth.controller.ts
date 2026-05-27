import { Request, Response } from 'express';
// REPLACE the two broken import lines with:
import {
  registerUser,
  loginUser,
  refreshSession,
  logoutUser,
  changeUserPassword,
  getPreloginData,
} from './auth.service';
import { registerSchema, loginSchema } from './auth.validation';

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
    res.status(500).json({ error: 'Failed to change password' });
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
