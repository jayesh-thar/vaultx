console.log('[VaultX] Content script loaded on', window.location.hostname);

// ── Types ──────────────────────────────────────────────────────────────────
interface CapturedField {
  name: string;
  type: string;
  value: string;
  label: string;
}

// ── Fill input (works with React/Vue/Angular) ─────────────────────────────
function fillInput(input: HTMLInputElement, value: string): void {
  input.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
}

// ── Get label for an input ────────────────────────────────────────────────
function getInputLabel(input: HTMLInputElement): string {
  // Try aria-label
  if (input.ariaLabel) return input.ariaLabel;
  // Try associated <label>
  if (input.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${input.id}"]`
    );
    if (label) return label.textContent?.trim() ?? '';
  }
  // Try placeholder
  if (input.placeholder) return input.placeholder;
  // Try name attribute
  if (input.name) return input.name;
  // Try type
  return input.type || 'field';
}

// ── Smart field name mapping ──────────────────────────────────────────────
function mapFieldToVaultKey(input: HTMLInputElement): string {
  const name = (input.name ?? '').toLowerCase();
  const type = input.type.toLowerCase();
  const id = (input.id ?? '').toLowerCase();
  const placeholder = (input.placeholder ?? '').toLowerCase();
  const combined = `${name} ${id} ${placeholder}`;

  if (type === 'email' || combined.includes('email')) return 'email';
  if (type === 'password') return 'password';
  if (combined.includes('username') || combined.includes('user_name'))
    return 'username';
  if (combined.includes('first') && combined.includes('name'))
    return 'firstName';
  if (combined.includes('last') && combined.includes('name')) return 'lastName';
  if (
    combined.includes('name') &&
    !combined.includes('first') &&
    !combined.includes('last')
  )
    return 'username';
  if (
    combined.includes('phone') ||
    combined.includes('mobile') ||
    combined.includes('tel')
  )
    return 'phone';
  if (combined.includes('birth') || combined.includes('dob'))
    return 'birthdate';
  if (combined.includes('zip') || combined.includes('postal')) return 'zipCode';
  if (combined.includes('address')) return 'address';
  if (combined.includes('city')) return 'city';
  if (combined.includes('country')) return 'country';
  if (combined.includes('card') && combined.includes('number'))
    return 'cardNumber';
  if (combined.includes('cvv') || combined.includes('cvc')) return 'cvv';
  if (combined.includes('expir')) return 'expiry';

  // Fall back to the actual name or id
  return name || id || type || 'field';
}

// ── Find login forms ──────────────────────────────────────────────────────
function findPasswordInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    'input[type="password"]:not([style*="display: none"])'
  );
}

function findAllFormInputs(): CapturedField[] {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input, select, textarea')
  );
  const fields: CapturedField[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    if (
      input.type === 'hidden' ||
      input.type === 'submit' ||
      input.type === 'button' ||
      input.type === 'checkbox' ||
      input.type === 'radio'
    )
      continue;
    if (!input.value?.trim()) continue;

    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const key = mapFieldToVaultKey(input as HTMLInputElement);
    if (seen.has(key)) continue;
    seen.add(key);

    fields.push({
      name: key,
      type: input.type || 'text',
      value: input.value.trim(),
      label: getInputLabel(input as HTMLInputElement),
    });
  }

  return fields;
}

// ── Autofill handler (called from popup) ─────────────────────────────────
function autofillCredentials(credentials: {
  username?: string;
  email?: string;
  password?: string;
  [key: string]: string | undefined;
}) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  );

  for (const input of inputs) {
    const key = mapFieldToVaultKey(input);
    const value = credentials[key];
    if (value) {
      fillInput(input, value);
    }
  }
}

// ── Save form submission ──────────────────────────────────────────────────
let formSubmitHandler: ((e: Event) => void) | null = null;

function setupFormSubmitCapture() {
  if (formSubmitHandler) return; // already set up

  formSubmitHandler = async (e: Event) => {
    const passwordInput = findPasswordInput();
    if (!passwordInput || !passwordInput.value.trim()) return;

    const fields = findAllFormInputs();
    if (fields.length < 2) return; // not a real form

    const domain = window.location.hostname;
    const title = document.title || domain;

    // Ask service worker to check auto-save preference + save
    const response = (await chrome.runtime.sendMessage({
      type: 'SAVE_FORM_FIELDS',
      payload: { fields, domain, title, url: window.location.href },
    })) as { saved: boolean; autoSave: boolean } | null;

    if (response?.saved) {
      showSaveToast('✓ Saved to VaultX');
    } else if (response && !response.autoSave) {
      showSaveBanner(fields, domain, title);
    }
  };

  // Attach to all forms
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', formSubmitHandler!);
  });

  // Also watch for submit buttons clicked without form submit event
  document
    .querySelectorAll<HTMLButtonElement>(
      'button[type="submit"], input[type="submit"]'
    )
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        setTimeout(() => formSubmitHandler!(new Event('submit')), 100);
      });
    });
}

// ── Save toast (shown when auto-save is ON) ───────────────────────────────
function showSaveToast(message: string) {
  const existing = document.getElementById('vaultx-toast');
  existing?.remove();

  const toast = document.createElement('div');
  toast.id = 'vaultx-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #10b981;
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: -apple-system, sans-serif;
    font-weight: 600;
    z-index: 2147483647;
    box-shadow: 0 4px 16px rgba(16,185,129,0.4);
    animation: vx-slide-in 0.3s ease;
  `;
  toast.textContent = message;

  const style = document.createElement('style');
  style.textContent = `@keyframes vx-slide-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Save banner (shown when auto-save is OFF) ─────────────────────────────
function showSaveBanner(
  fields: CapturedField[],
  domain: string,
  title: string
) {
  const existing = document.getElementById('vaultx-save-banner');
  existing?.remove();

  const banner = document.createElement('div');
  banner.id = 'vaultx-save-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 280px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 14px;
    font-family: -apple-system, sans-serif;
    z-index: 2147483647;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;

  const emailField = fields.find(
    (f) => f.name === 'email' || f.name === 'username'
  );
  const subtitle = emailField ? emailField.value : domain;

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:18px;">🔐</span>
      <div style="flex:1;overflow:hidden;">
        <p style="font-size:13px;font-weight:600;color:#f1f5f9;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(title)}</p>
        <p style="font-size:11px;color:#64748b;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(subtitle)}</p>
      </div>
      <button id="vaultx-banner-close" style="background:none;border:none;color:#475569;cursor:pointer;font-size:16px;padding:0;line-height:1;">✕</button>
    </div>
    <p style="font-size:11px;color:#64748b;margin:0 0 10px;">${fields.length} field${fields.length !== 1 ? 's' : ''} to save</p>
    <div style="display:flex;gap:8px;">
      <button id="vaultx-banner-save" style="flex:1;padding:8px 0;border-radius:7px;border:none;background:#10b981;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Save to VaultX</button>
      <button id="vaultx-banner-ignore" style="flex:1;padding:8px 0;border-radius:7px;border:1px solid #334155;background:transparent;color:#64748b;font-size:12px;cursor:pointer;">Not now</button>
    </div>
  `;

  document.body.appendChild(banner);

  document
    .getElementById('vaultx-banner-close')
    ?.addEventListener('click', () => banner.remove());
  document
    .getElementById('vaultx-banner-ignore')
    ?.addEventListener('click', () => banner.remove());
  document
    .getElementById('vaultx-banner-save')
    ?.addEventListener('click', async () => {
      banner.remove();
      await chrome.runtime.sendMessage({
        type: 'SAVE_FORM_FIELDS',
        payload: {
          fields,
          domain,
          title,
          url: window.location.href,
          forcesSave: true,
        },
      });
      showSaveToast('✓ Saved to VaultX');
    });

  // Auto-dismiss after 15 seconds
  setTimeout(() => banner.remove(), 15000);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Message listener (from popup or service worker) ───────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'AUTOFILL_CREDENTIALS') {
    autofillCredentials(msg.payload);
    sendResponse({ success: true });
  }

  if (msg.type === 'GET_FORM_FIELDS') {
    sendResponse({ fields: findAllFormInputs() });
  }

  if (msg.type === 'SETUP_FORM_CAPTURE') {
    setupFormSubmitCapture();
    sendResponse({ success: true });
  }

  return true;
});

// Always set up form capture
setupFormSubmitCapture();
