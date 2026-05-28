import { Request, Response, NextFunction } from 'express';
import { promises as dns } from 'dns';

// Top 50 known disposable/temp email domains
const BLOCKED_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  '10minutemail.com',
  'yopmail.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'grr.la',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'spam4.me',
  'trashmail.com',
  'trashmail.me',
  'trashmail.net',
  'maildrop.cc',
  'dispostable.com',
  'fakeinbox.com',
  'mailnull.com',
  'spamgourmet.com',
  'spamgourmet.net',
  'spamgourmet.org',
  'getairmail.com',
  'filzmail.com',
  'discard.email',
  'spamherelots.com',
  'spamhereplease.com',
  'anonaddy.com',
  'spamfree24.org',
  'tempr.email',
  'trbvm.com',
  'bum.net',
  'drdrb.net',
  'vomoto.com',
]);

export async function validateEmailDomain(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const email = (req.body?.email ?? '').toLowerCase();
  if (!email) {
    next();
    return;
  }

  const domain = email.split('@')[1];
  if (!domain) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  // Check against known disposable domains
  if (BLOCKED_DOMAINS.has(domain)) {
    res.status(400).json({
      error:
        'Disposable email addresses are not allowed. Please use a real email.',
    });
    return;
  }

  // Check if domain has valid MX records (can actually receive mail)
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      res
        .status(400)
        .json({ error: 'This email domain cannot receive messages.' });
      return;
    }
  } catch {
    // DNS lookup failed — fail open. Don't block valid emails due to DNS issues.
    // The disposable domain list already handles the most common temp mail services.
    next();
    return;
  }

  next();
}
