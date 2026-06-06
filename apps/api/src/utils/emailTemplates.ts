const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const BRAND_COLOR = '#10B981';

// ─── Base layout ─────────────────────────────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;background:#0E0E0E;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:8px;">
                <div style="width:32px;height:32px;background:#0D2818;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
                  <span style="color:${BRAND_COLOR};font-size:18px;">🔐</span>
                </div>
                <span style="color:#F0F0F0;font-weight:600;font-size:18px;">VaultX</span>
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#141414;border-radius:16px;border:0.5px solid #2A2A2A;overflow:hidden;">
              <div style="padding:32px;">
                ${body}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="color:#444;font-size:12px;margin:0;">
                Zero-knowledge encrypted password manager.<br>
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;margin-top:20px;">${text}</a>`;
}

function h1(text: string): string {
  return `<h1 style="color:#F0F0F0;font-size:22px;font-weight:600;margin:0 0 8px 0;">${text}</h1>`;
}

function p(text: string, muted = false): string {
  return `<p style="color:${muted ? '#888' : '#C0C0C0'};font-size:14px;line-height:1.6;margin:12px 0 0 0;">${text}</p>`;
}

function divider(): string {
  return `<div style="border-top:0.5px solid #2A2A2A;margin:24px 0;"></div>`;
}

function infoRow(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #1E1E1E;">
    <span style="color:#888;font-size:13px;">${label}</span>
    <span style="color:#C0C0C0;font-size:13px;">${value}</span>
  </div>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function welcomeEmail(displayName: string, email: string): string {
  const body = `
    ${h1(`Welcome to VaultX, ${displayName}!`)}
    ${p('Your zero-knowledge password vault is ready. Your data is encrypted before it ever leaves your device — not even we can see it.')}
    ${divider()}
    <div style="background:#0D2818;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:${BRAND_COLOR};font-size:13px;font-weight:500;margin:0 0 8px 0;">🔒 What zero-knowledge means for you</p>
      <p style="color:#888;font-size:13px;margin:0;line-height:1.6;">
        Your master password is never stored or transmitted. All encryption happens locally using AES-256-GCM. Only you can decrypt your vault.
      </p>
    </div>
    ${btn('Go to your vault', APP_URL + '/dashboard')}
    ${p(`Registered as: ${email}`, true)}
  `;
  return layout('Welcome to VaultX', body);
}

export function passwordChangedEmail(
  displayName: string,
  email: string,
  deviceInfo: { ip?: string; userAgent?: string }
): string {
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const body = `
    ${h1('Master password changed')}
    ${p('Your VaultX master password was successfully changed. All other sessions have been signed out.')}
    ${divider()}
    ${infoRow('Account', email)}
    ${infoRow('Time', now + ' UTC')}
    ${infoRow('IP Address', deviceInfo.ip ?? 'Unknown')}
    ${divider()}
    <div style="background:#2A0000;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#EF4444;font-size:13px;font-weight:500;margin:0 0 6px 0;">⚠ Not you?</p>
      <p style="color:#C08080;font-size:13px;margin:0;">
        If you didn't make this change, your account may be compromised. Change your master password immediately.
      </p>
    </div>
    ${btn('Go to vault', APP_URL + '/login')}
  `;
  return layout('Master password changed — VaultX', body);
}

export function newLoginEmail(
  displayName: string,
  email: string,
  deviceInfo: { ip?: string; userAgent?: string; browser?: string }
): string {
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const body = `
    ${h1('New sign-in to your vault')}
    ${p('Someone just signed in to your VaultX account.')}
    ${divider()}
    ${infoRow('Account', email)}
    ${infoRow('Time', now + ' UTC')}
    ${infoRow('IP Address', deviceInfo.ip ?? 'Unknown')}
    ${infoRow('Device', deviceInfo.userAgent?.slice(0, 60) ?? 'Unknown')}
    ${divider()}
    <div style="background:#1A1A00;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#F59E0B;font-size:13px;font-weight:500;margin:0 0 6px 0;">⚠ Wasn't you?</p>
      <p style="color:#C0A060;font-size:13px;margin:0;">
        If this wasn't you, change your master password immediately and check for any suspicious activity.
      </p>
    </div>
    ${btn('Review account', APP_URL + '/settings')}
  `;
  return layout('New sign-in — VaultX', body);
}

export function breachAlertEmail(
  displayName: string,
  email: string,
  breachedSites: string[]
): string {
  const siteList = breachedSites
    .map(
      (s) => `<li style="color:#C0C0C0;font-size:13px;padding:4px 0;">${s}</li>`
    )
    .join('');

  const body = `
    ${h1('Breach alert for your vault')}
    ${p('Our security check found passwords in your vault that have appeared in known data breaches.')}
    ${divider()}
    <p style="color:#888;font-size:13px;margin:0 0 8px 0;">Affected accounts:</p>
    <ul style="margin:0;padding-left:20px;">
      ${siteList}
    </ul>
    ${divider()}
    <div style="background:#2A0000;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#EF4444;font-size:13px;font-weight:500;margin:0 0 6px 0;">🔴 Action required</p>
      <p style="color:#C08080;font-size:13px;margin:0;">
        Change passwords for the affected accounts immediately. Use the "Generate" button in VaultX to create a strong unique password for each.
      </p>
    </div>
    ${btn('Check vault health', APP_URL + '/health')}
  `;
  return layout('Password breach detected — VaultX', body);
}

export function accountDeletionExportEmail(
  email: string,
  exportJson: string
): string {
  const preview =
    exportJson.slice(0, 500) + (exportJson.length > 500 ? '...' : '');
  return layout(
    'Your VaultX data export',
    `
    ${h1('Account deleted — your data export')}
    ${p('Your VaultX account has been deleted. Below is an encrypted export of your vault data.')}
    ${divider()}
    <div style="background:#1A1A00;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#F59E0B;font-size:13px;font-weight:500;margin:0 0 8px 0;">⚠ Keep this email safe</p>
      <p style="color:#C0A060;font-size:13px;margin:0;">
        Your items are encrypted. You'll need your master password to decrypt them if you import into a new vault.
      </p>
    </div>
    <pre style="background:#0D0D0D;border-radius:8px;padding:16px;overflow:auto;font-size:11px;color:#888;max-height:200px;word-break:break-all;">${preview}</pre>
    ${p(`Account: ${email}`, true)}
  `
  );
}

export function forgotPasswordEmail(email: string, code: string): string {
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
          <h2 style="color:#F0F0F0;font-size:18px;margin:0 0 8px 0;">Reset your master password</h2>
          <p style="color:#888;font-size:14px;margin:0 0 16px 0;">
            Enter this code to reset your password. Note: this will permanently delete your vault data.
          </p>
          <div style="background:#2A1A00;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
            <span style="color:#F59E0B;font-size:36px;font-weight:700;letter-spacing:12px;">${code}</span>
          </div>
          <div style="background:#2A0000;border-radius:8px;padding:12px;margin-bottom:16px;">
            <p style="color:#EF4444;font-size:13px;margin:0;">
              ⚠ <strong>Warning:</strong> Resetting your password will permanently delete all saved passwords. 
              This cannot be undone.
            </p>
          </div>
          <p style="color:#666;font-size:13px;margin:0;">
            Code expires in 10 minutes. If you didn't request this, ignore this email.
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

export function cardPinSetEmail(name: string, email: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
    .header { background: linear-gradient(135deg, #10b981, #059669); padding: 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; color: #fff; }
    .header p { margin: 8px 0 0; color: #d1fae5; font-size: 14px; }
    .body { padding: 32px; }
    .badge { display: inline-block; background: #10b981; color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    .section { background: #0f172a; border-radius: 10px; padding: 20px; margin: 16px 0; border: 1px solid #334155; }
    .section h3 { margin: 0 0 12px; color: #10b981; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .rule { display: flex; align-items: flex-start; gap: 10px; margin: 10px 0; font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .rule span { color: #10b981; font-size: 16px; flex-shrink: 0; }
    .steps { counter-reset: step; }
    .step { display: flex; gap: 12px; margin: 10px 0; font-size: 13px; color: #94a3b8; }
    .step-num { background: #10b981; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
    .footer { padding: 20px 32px; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #475569; }
    a { color: #10b981; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 VaultX</h1>
      <p>Zero-knowledge password manager</p>
    </div>
    <div class="body">
      <p>Hi <strong>${name}</strong>,</p>
      <div class="badge">✓ Card PIN Successfully Set</div>
      <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
        Congratulations! You've secured your payment cards with a Card PIN on VaultX.
        Your financial data now has an extra layer of protection — completely separate from your master password.
      </p>

      <div class="section">
        <h3>🛡️ What Your Card PIN Does</h3>
        <div class="rule"><span>✓</span> Required every time you view card details in the extension</div>
        <div class="rule"><span>✓</span> Required to delete any payment card</div>
        <div class="rule"><span>✓</span> Stays active for 5 minutes per session, then auto-locks</div>
        <div class="rule"><span>✓</span> Stored securely as a bcrypt hash — we never see your PIN</div>
        <div class="rule"><span>✓</span> One PIN protects all your cards across all devices</div>
        <div class="rule"><span>✓</span> Completely independent from your master password</div>
      </div>

      <div class="section">
        <h3>🔄 How to Reset Your PIN (if forgotten)</h3>
        <p style="font-size: 12px; color: #64748b; margin: 0 0 12px;">You can reset your Card PIN from the web app or extension:</p>
        <div class="steps">
          <div class="step"><div class="step-num">1</div><span>Go to <a href="http://localhost:5173/settings">VaultX Web App → Settings</a></span></div>
          <div class="step"><div class="step-num">2</div><span>Navigate to <strong>Security → Card PIN</strong></span></div>
          <div class="step"><div class="step-num">3</div><span>Click <strong>"Reset Card PIN"</strong></span></div>
          <div class="step"><div class="step-num">4</div><span>Enter your <strong>Master Password</strong> to verify identity</span></div>
          <div class="step"><div class="step-num">5</div><span>Set a new Card PIN — all cards will re-lock immediately</span></div>
        </div>
        <p style="font-size: 12px; color: #64748b; margin: 12px 0 0;">
          From the extension: open popup → go to Settings → Card PIN → Reset (requires master password).
        </p>
      </div>

      <div class="section">
        <h3>💡 Security Tips</h3>
        <div class="rule"><span>→</span> Don't use the same PIN as your bank card</div>
        <div class="rule"><span>→</span> Don't share your PIN with anyone — VaultX support will never ask for it</div>
        <div class="rule"><span>→</span> If you suspect your PIN is compromised, reset it immediately</div>
        <div class="rule"><span>→</span> Your master password can always reset the PIN if needed</div>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-top: 20px;">
        If you did not set this PIN, please 
        <a href="http://localhost:5173/settings/security">secure your account immediately</a> 
        and contact support.
      </p>
    </div>
    <div class="footer">
      VaultX Security Team · <a href="http://localhost:5173">vaultx.app</a><br>
      This is an automated security notification for ${email}
    </div>
  </div>
</body>
</html>
`;
}
