import { Request, Response } from 'express';
import { pool } from '../../db/pool';
import { redis } from '../../db/redis';
import { sendEmail } from '../../utils/mailer';

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function otpEmailHtml(email: string, code: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" style="max-width:480px;width:100%;">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <span style="color:#F0F0F0;font-weight:600;font-size:18px;">🔐 VaultX</span>
        </td></tr>
        <tr><td style="background:#141414;border-radius:16px;border:0.5px solid #2A2A2A;padding:32px;">
          <h2 style="color:#F0F0F0;font-size:18px;margin:0 0 8px 0;">Verification code</h2>
          <p style="color:#888;font-size:14px;margin:0 0 24px 0;">
            Enter this code to verify your identity for changing your master password.
          </p>
          <div style="background:#0D2818;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <span style="color:#10B981;font-size:36px;font-weight:700;letter-spacing:12px;">${code}</span>
          </div>
          <p style="color:#666;font-size:13px;margin:0;">
            This code expires in <strong style="color:#888;">10 minutes</strong>.
            If you didn't request this, ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="color:#444;font-size:12px;margin:0;">Sent to ${email}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Send OTP
export async function sendOTP(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const userRow = await pool.query('SELECT email FROM users WHERE id = $1', [
      userId,
    ]);
    if (!userRow.rows.length) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { email } = userRow.rows[0];

    const code = generateOTP();
    const key = `otp:${userId}`;

    await redis.setex(key, 600, JSON.stringify({ code, attempts: 0 }));

    await sendEmail({
      to: email,
      subject: `${code} — VaultX verification code`,
      html: otpEmailHtml(email, code),
    });

    // Return masked email so frontend can show "sent to j***@gmail.com"
    const masked = email.replace(/(.{1}).+(@.+)/, '$1***$2');
    res.json({ message: 'OTP sent', maskedEmail: masked });
  } catch {
    res.status(500).json({ error: 'Failed to send OTP' });
  }
}

// Verify OTP
export async function verifyOTP(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'OTP code required' });
      return;
    }

    const key = `otp:${userId}`;
    const raw = await redis.get(key);
    if (!raw) {
      res.status(400).json({ error: 'OTP expired or not sent' });
      return;
    }

    const { code: stored, attempts } = JSON.parse(raw);

    if (attempts >= 3) {
      await redis.del(key);
      res.status(400).json({ error: 'Too many attempts. Request a new OTP.' });
      return;
    }

    if (code !== stored) {
      await redis.set(
        key,
        JSON.stringify({ code: stored, attempts: attempts + 1 }),
        'KEEPTTL'
      );
      res.status(400).json({ error: 'Incorrect code. Try again.' });
      return;
    }

    // Correct — delete OTP and create a short-lived "verified" token
    await redis.del(key);
    await redis.setex(`otp_verified:${userId}`, 300, '1'); // 5 minutes to complete password change

    res.json({ verified: true });
  } catch {
    res.status(500).json({ error: 'Verification failed' });
  }
}
