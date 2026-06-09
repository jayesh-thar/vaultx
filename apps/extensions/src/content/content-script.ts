console.log('[VaultX] Content script loaded on', window.location.hostname);

// ── Excluded domains — skip form capture on these ─────────────────────────
const EXCLUDED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  'bitwarden.com',
  '1password.com',
  'lastpass.com',
];
const isExcluded = EXCLUDED_DOMAINS.some((d) =>
  window.location.hostname.includes(d)
);

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
  if (input.ariaLabel) return input.ariaLabel;
  if (input.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${input.id}"]`
    );
    if (label) return label.textContent?.trim() ?? '';
  }
  if (input.placeholder) return input.placeholder;
  if (input.name) return input.name;
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
  return name || id || type || 'field';
}

// ── Find password input ───────────────────────────────────────────────────
function findPasswordInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    'input[type="password"]:not([style*="display: none"])'
  );
}

// ── Capture all visible filled inputs ─────────────────────────────────────
function findAllFormInputs(): CapturedField[] {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input, select, textarea')
  );
  const fields: CapturedField[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    if (
      ['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(input.type)
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

// ── Autofill credentials into form ────────────────────────────────────────
function autofillCredentials(credentials: Record<string, string | undefined>) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  );
  for (const input of inputs) {
    const key = mapFieldToVaultKey(input);
    const value = credentials[key];
    if (value) fillInput(input, value);
  }
}

// ── HTML escape helper ────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Save toast (auto-save ON) ─────────────────────────────────────────────
function showSaveToast(message: string) {
  document.getElementById('vaultx-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'vaultx-toast';
  toast.style.cssText = `
    position:fixed;bottom:20px;right:20px;
    background:#10b981;color:#fff;
    padding:10px 16px;border-radius:8px;
    font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;
    z-index:2147483647;box-shadow:0 4px 16px rgba(16,185,129,0.4);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Save banner (auto-save OFF) ───────────────────────────────────────────
function showSaveBanner(
  fields: CapturedField[],
  domain: string,
  title: string
) {
  document.getElementById('vaultx-save-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'vaultx-save-banner';
  banner.style.cssText = `
    position:fixed;bottom:20px;right:20px;width:280px;
    background:#1e293b;border:1px solid #334155;border-radius:12px;
    padding:14px;font-family:-apple-system,sans-serif;
    z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,0.5);
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
    <p style="font-size:11px;color:#64748b;margin:0 0 10px;">${fields.length} field${fields.length !== 1 ? 's' : ''} detected</p>
    <div style="display:flex;gap:8px;">
      <button id="vaultx-banner-save" style="flex:1;padding:8px 0;border-radius:7px;border:none;background:#10b981;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Save to VaultX</button>
      <button id="vaultx-banner-ignore" style="flex:1;padding:8px 0;border-radius:7px;border:1px solid #334155;background:transparent;color:#64748b;font-size:12px;cursor:pointer;">Not now</button>
    </div>
  `;

  document.body.appendChild(banner);

  const pendingPayload = { fields, domain, title, url: window.location.href };

  // Close — save to pending queue
  document
    .getElementById('vaultx-banner-close')
    ?.addEventListener('click', async () => {
      banner.remove();
      await chrome.runtime.sendMessage({
        type: 'SAVE_PENDING_CREDENTIAL',
        payload: pendingPayload,
      });
    });

  // Not now — save to pending queue
  document
    .getElementById('vaultx-banner-ignore')
    ?.addEventListener('click', async () => {
      banner.remove();
      await chrome.runtime.sendMessage({
        type: 'SAVE_PENDING_CREDENTIAL',
        payload: pendingPayload,
      });
    });

  // Save now
  document
    .getElementById('vaultx-banner-save')
    ?.addEventListener('click', async () => {
      banner.remove();
      const res = (await chrome.runtime.sendMessage({
        type: 'SAVE_FORM_FIELDS',
        payload: { ...pendingPayload, forceSave: true },
      })) as { saved: boolean } | null;
      showSaveToast(
        res?.saved ? '✓ Saved to VaultX' : '✗ Save failed — are you logged in?'
      );
    });

  // Auto-dismiss after 15 seconds — save to pending
  setTimeout(async () => {
    if (document.getElementById('vaultx-save-banner')) {
      banner.remove();
      await chrome.runtime.sendMessage({
        type: 'SAVE_PENDING_CREDENTIAL',
        payload: pendingPayload,
      });
    }
  }, 15000);
}

// ── Form submit capture ───────────────────────────────────────────────────
let formSubmitHandler: ((e: Event) => void) | null = null;
let observerSetup = false;

function setupFormSubmitCapture() {
  if (formSubmitHandler) return;

  formSubmitHandler = async (_e: Event) => {
    // Small delay so form values are still in DOM after submit
    await new Promise((r) => setTimeout(r, 150));

    const passwordInput = findPasswordInput();
    if (!passwordInput || !passwordInput.value.trim()) return;

    const fields = findAllFormInputs();
    if (fields.length < 2) return;

    const domain = window.location.hostname;
    const title = document.title || domain;

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

  // Attach to existing forms
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', formSubmitHandler!);
  });

  // Submit buttons that don't trigger form submit event
  document
    .querySelectorAll<HTMLButtonElement>(
      'button[type="submit"], input[type="submit"]'
    )
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        setTimeout(() => formSubmitHandler!(new Event('submit')), 200);
      });
    });

  // MutationObserver for SPAs — re-attach to new forms added to DOM
  if (!observerSetup) {
    observerSetup = true;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver(() => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        // Attach handler to any new forms
        document.querySelectorAll('form').forEach((form) => {
          if (!(form as any).__vaultx_attached) {
            form.addEventListener('submit', formSubmitHandler!);
            (form as any).__vaultx_attached = true;
          }
        });
        scanTimer = null;
      }, 500);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('beforeunload', () => observer.disconnect());
  }
}

// ── Message listener ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'AUTOFILL_CREDENTIALS') {
    autofillCredentials(msg.payload);
    sendResponse({ success: true });
    return true;
  }
  if (msg.type === 'GET_FORM_FIELDS') {
    sendResponse({ fields: findAllFormInputs() });
    return true;
  }
  if (msg.type === 'SETUP_FORM_CAPTURE') {
    setupFormSubmitCapture();
    sendResponse({ success: true });
    return true;
  }
  return true;
});

// ── Init — only on non-excluded domains ───────────────────────────────────
if (!isExcluded) {
  setupFormSubmitCapture();
}
