import nodemailer from 'nodemailer';

// Lazy transporter — only created when needed
let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!process.env.SMTP_HOST) {
    console.warn('[Mailer] SMTP not configured — emails will be logged only');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

interface SendOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    // Dev fallback: log to console
    console.log(`\n📧 [EMAIL] To: ${opts.to}`);
    console.log(`   Subject: ${opts.subject}`);
    console.log(`   (SMTP not configured — email not sent)\n`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'VaultX <noreply@vaultx.app>',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    // Never let email failures crash the app
    console.error('[Mailer] Failed to send email:', err);
  }
}
