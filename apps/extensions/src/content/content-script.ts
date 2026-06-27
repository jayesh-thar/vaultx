console.log('[VaultX] Content script loaded on', window.location.hostname);

// ── Excluded domains ──────────────────────────────────────────────────────
const EXCLUDED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  'bitwarden.com',
  '1password.com',
  'lastpass.com',
  'vaultx-jayesh.vercel.app',
];
const isExcluded = EXCLUDED_DOMAINS.some((d) =>
  window.location.hostname.includes(d)
);

// ── Types ─────────────────────────────────────────────────────────────────
interface CapturedField {
  name: string;
  type: string;
  value: string;
  label: string;
}

interface AutofillItem {
  id: string;
  payload: {
    title: string;
    username?: string;
    email?: string;
    password?: string;
  };
}

const PENDING_CAPTURE_KEY = 'vaultx_pending_capture';
const CAPTURE_TIMEOUT_MS = 10000; // 10 seconds

// ── State ─────────────────────────────────────────────────────────────────
let saveAttempted = false;
let lastSaveTime = 0;
const SAVE_DEBOUNCE_MS = 3000; // prevent double-saves within 3s

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

// ── Label detection ───────────────────────────────────────────────────────
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

// ── Field name mapping ────────────────────────────────────────────────────
function mapFieldToVaultKey(input: HTMLInputElement): string {
  const name = (input.name ?? '').toLowerCase();
  const type = input.type.toLowerCase();
  const id = (input.id ?? '').toLowerCase();
  const placeholder = (input.placeholder ?? '').toLowerCase();
  const autocomplete = (input.autocomplete ?? '').toLowerCase();
  const ariaLabel = (input.getAttribute('aria-label') ?? '').toLowerCase();
  const combined = `${name} ${id} ${placeholder} ${autocomplete} ${ariaLabel}`;

  if (type === 'email' || combined.includes('email')) return 'email';
  if (type === 'password') return 'password';
  if (
    combined.includes('cardholder') ||
    (combined.includes('card') && combined.includes('name'))
  )
    return 'cardholder';
  if (
    combined.includes('username') ||
    combined.includes('user_name') ||
    combined.includes('user name')
  )
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

// ── Find visible password input ───────────────────────────────────────────
function findPasswordInput(): HTMLInputElement | null {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  );
  return (
    inputs.find((inp) => {
      const style = window.getComputedStyle(inp);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        inp.offsetParent !== null
      );
    }) ?? null
  );
}

// ── Find card number input ────────────────────────────────────────────────
function findCardNumberInput(): HTMLInputElement | null {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  );
  for (const input of inputs) {
    const combined =
      `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete}`.toLowerCase();
    if (
      combined.includes('cardnumber') ||
      combined.includes('card-number') ||
      combined.includes('cc-number') ||
      combined.includes('cc-num') ||
      (combined.includes('card') && combined.includes('number'))
    ) {
      const style = window.getComputedStyle(input);
      if (style.display !== 'none' && style.visibility !== 'hidden')
        return input;
    }
  }
  return null;
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

// ── Check if field is visually gone ──────────────────────────────────────
function isFieldVisuallyGone(
  field: HTMLInputElement | null,
  capturedValue: string
): boolean {
  if (!field) return true;
  if (!field.value) return true;
  if (!field.offsetParent) return true;
  const style = window.getComputedStyle(field);
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden') return true;
  if (style.opacity === '0') return true;
  if (field.value !== capturedValue) return true; // value changed = success
  return false;
}

// ── Autofill ──────────────────────────────────────────────────────────────
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

// ── HTML escape ───────────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Core save logic ───────────────────────────────────────────────────────
async function attemptSave(
  fields: CapturedField[],
  domain: string,
  title: string,
  url: string,
  fromClick = false
) {
  // Debounce — prevent double-save from both form submit + click
  const now = Date.now();
  if (now - lastSaveTime < SAVE_DEBOUNCE_MS) return;
  lastSaveTime = now;

  const hasIdentifier = fields.some(
    (f) => f.name === 'email' || f.name === 'username'
  );
  const hasPassword = fields.some((f) => f.name === 'password');

  // Multi-step form: step 1 has identifier but no password yet
  if (hasIdentifier && !hasPassword && !fromClick) {
    console.log('[VaultX] Step 1 captured — storing partial fields');
    await chrome.runtime.sendMessage({
      type: 'STORE_PARTIAL_FIELDS',
      payload: { fields, domain },
    });
    return;
  }

  if (!hasIdentifier || !hasPassword) return;

  // Check session
  try {
    const session = (await chrome.runtime.sendMessage({
      type: 'CHECK_SESSION',
    })) as { isLoggedIn: boolean };
    if (!session?.isLoggedIn) return;
  } catch {
    return;
  }

  const response = (await chrome.runtime.sendMessage({
    type: 'SAVE_FORM_FIELDS',
    payload: { fields, domain, title, url, mergePartial: true },
  })) as {
    saved: boolean;
    autoSave: boolean;
    id?: string;
    title?: string;
    updated?: boolean;
    silent?: boolean;
  } | null;

  if (!response) return;

  if (response.saved) {
    if (response.silent) return; // unchanged credentials — completely quiet
    showAutoSaveToast(
      response.id,
      response.title || title,
      response.updated,
      fields,
      domain,
      title,
      url
    );
  } else if (!response.autoSave) {
    showSaveBanner(fields, domain, title);
  }
}

// ── Pending capture (for navigation-based logins) ─────────────────────────
async function storePendingCapture(
  fields: CapturedField[],
  domain: string,
  title: string,
  url: string,
  passwordValue: string = ''
) {
  await chrome.runtime.sendMessage({
    type: 'STORE_PARTIAL_FIELDS',
    payload: {
      fields,
      domain,
      pendingCapture: true,
      submittedUrl: window.location.href,
      timestamp: Date.now(),
      passwordValue,
      title,
      url,
    },
  });
}

async function checkPendingCaptureOnLoad() {
  // Ask service worker if there's a pending capture for this domain
  try {
    const r = (await chrome.runtime.sendMessage({
      type: 'GET_PENDING_CAPTURE',
      payload: { domain: window.location.hostname },
    })) as {
      fields: CapturedField[];
      domain: string;
      title: string;
      url: string;
      submittedUrl: string;
      timestamp: number;
      passwordValue: string;
    } | null;

    if (!r) return;
    if (Date.now() - r.timestamp > CAPTURE_TIMEOUT_MS) return;

    const navigated = window.location.href !== r.submittedUrl;
    const currentPwField = findPasswordInput();
    const passwordStillSame = currentPwField?.value === r.passwordValue;

    if (!navigated && passwordStillSame) {
      console.log('[VaultX] Login likely failed — not saving');
      return;
    }

    await attemptSave(r.fields, r.domain, r.title, r.url);
  } catch {
    /* ignore */
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────
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

function showAutoSaveToast(
  itemId: string | undefined,
  title: string,
  updated = false,
  pendingFields: CapturedField[] = [],
  pendingDomain = '',
  pendingTitle = '',
  pendingUrl = ''
) {
  document.getElementById('vaultx-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'vaultx-toast';
  toast.style.cssText = `
    position:fixed;bottom:20px;right:20px;
    background:#10b981;color:#fff;
    padding:10px 14px;border-radius:8px;
    font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;
    z-index:2147483647;box-shadow:0 4px 16px rgba(16,185,129,0.4);
    display:flex;align-items:center;gap:10px;
  `;
  const action = updated ? '✓ Updated' : '✓ Saved';
  const showCancel = !!(itemId && !updated); // cancel only for new saves
  toast.innerHTML = `<span>${action} "${escapeHtml(title.slice(0, 24))}"</span>${
    showCancel
      ? '<button id="vx-undo" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;font-weight:600;">Cancel</button>'
      : ''
  }`;
  document.body.appendChild(toast);

  if (showCancel && itemId) {
    document.getElementById('vx-undo')?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({
        type: 'DELETE_VAULT_ITEM',
        payload: { id: itemId },
      });
      // Save to pending queue — user can recover from extension popup within 10 min
      await chrome.runtime.sendMessage({
        type: 'SAVE_PENDING_CREDENTIAL',
        payload: {
          fields: pendingFields,
          domain: pendingDomain,
          title: pendingTitle,
          url: pendingUrl,
        },
      });
      toast.remove();
    });
    chrome.runtime.sendMessage({
      type: 'SET_LAST_AUTOSAVE',
      payload: { id: itemId, title, expiresAt: Date.now() + 5 * 60 * 1000 },
    });
  }
  setTimeout(() => toast.remove(), 4000);
}

// ── Save banner (when auto-save is OFF) ───────────────────────────────────
function showSaveBanner(
  fields: CapturedField[],
  domain: string,
  title: string
) {
  document.getElementById('vaultx-save-banner')?.remove();
  const banner = document.createElement('div');
  banner.id = 'vaultx-save-banner';
  banner.style.cssText = `
    position:fixed;top:20px;right:20px;width:280px;
    background:#1e293b;border:1px solid #334155;border-radius:12px;
    padding:14px;font-family:-apple-system,sans-serif;
    z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,0.5);
    isolation:isolate;pointer-events:auto;
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
      <button id="vaultx-banner-close" style="background:none;border:none;color:#475569;cursor:pointer;font-size:16px;padding:0;">✕</button>
    </div>
    <p style="font-size:11px;color:#64748b;margin:0 0 10px;">${fields.length} field${fields.length !== 1 ? 's' : ''} detected</p>
    <div style="display:flex;gap:8px;">
      <button id="vaultx-banner-save" style="flex:1;padding:8px 0;border-radius:7px;border:none;background:#10b981;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Save to VaultX</button>
      <button id="vaultx-banner-ignore" style="flex:1;padding:8px 0;border-radius:7px;border:1px solid #334155;background:transparent;color:#64748b;font-size:12px;cursor:pointer;">Not now</button>
    </div>
  `;
  document.documentElement.appendChild(banner);

  const pendingPayload = { fields, domain, title, url: window.location.href };

  const saveToPending = async () => {
    await chrome.runtime.sendMessage({
      type: 'SAVE_PENDING_CREDENTIAL',
      payload: pendingPayload,
    });
  };

  document
    .getElementById('vaultx-banner-close')
    ?.addEventListener('click', async () => {
      banner.remove();
      await saveToPending();
    });
  document
    .getElementById('vaultx-banner-ignore')
    ?.addEventListener('click', async () => {
      banner.remove();
      await saveToPending();
    });
  document
    .getElementById('vaultx-banner-save')
    ?.addEventListener('click', async () => {
      banner.remove();
      const res = (await chrome.runtime.sendMessage({
        type: 'SAVE_FORM_FIELDS',
        payload: { ...pendingPayload, forceSave: true },
      })) as { saved: boolean; id?: string; title?: string } | null;
      if (res?.saved) showAutoSaveToast(res.id, res.title || title);
      else showSaveToast('✗ Not logged in to VaultX');
    });

  setTimeout(async () => {
    if (document.getElementById('vaultx-save-banner')) {
      banner.remove();
      await saveToPending();
    }
  }, 15000);
}

// ── Autofill suggestion box ───────────────────────────────────────────────
function showAutofillSuggestion(items: AutofillItem[]) {
  document.getElementById('vaultx-autofill-suggestion')?.remove();
  const box = document.createElement('div');
  box.id = 'vaultx-autofill-suggestion';
  box.style.cssText = `
    position:fixed;top:20px;right:20px;width:260px;
    background:#1e293b;border:1px solid #334155;border-radius:12px;
    padding:12px;font-family:-apple-system,sans-serif;
    z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,0.5);
    isolation:isolate;pointer-events:auto;
  `;
  const list = items
    .slice(0, 3)
    .map((item, i) => {
      const label =
        item.payload.username || item.payload.email || item.payload.title;
      return `<button data-idx="${i}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border-radius:8px;border:none;background:#0f172a;color:#f1f5f9;font-size:12px;cursor:pointer;text-align:left;margin-bottom:6px;">
      <span style="font-size:15px;">🔑</span>
      <div style="min-width:0">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">${escapeHtml(item.payload.title)}</div>
        <div style="font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(label)}</div>
      </div>
    </button>`;
    })
    .join('');
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:16px;">🔐</span>
      <p style="font-size:12px;font-weight:600;color:#f1f5f9;margin:0;flex:1;">VaultX — Autofill available</p>
      <button id="vaultx-autofill-close" style="background:none;border:none;color:#475569;cursor:pointer;font-size:14px;padding:0;">✕</button>
    </div>
    ${list}
  `;
  document.documentElement.appendChild(box);
  box.querySelectorAll('button[data-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number((btn as HTMLElement).dataset.idx);
      const item = items[idx];
      autofillCredentials({
        email: item.payload.email,
        username: item.payload.username,
        password: item.payload.password,
      });
      box.remove();
    });
  });
  document
    .getElementById('vaultx-autofill-close')
    ?.addEventListener('click', () => box.remove());
  setTimeout(() => box.remove(), 20000);
}

async function checkAutofillSuggestion() {
  const passwordInput = findPasswordInput();
  if (!passwordInput) return;

  // Must have at least one other visible input (email/username) alongside password
  const otherInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  ).filter((inp) => {
    if (inp === passwordInput) return false;
    if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(inp.type))
      return false;
    const style = window.getComputedStyle(inp);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (otherInputs.length === 0) return;

  try {
    const session = (await chrome.runtime.sendMessage({
      type: 'CHECK_SESSION',
    })) as { isLoggedIn: boolean };
    if (!session?.isLoggedIn) return;
    const res = (await chrome.runtime.sendMessage({
      type: 'GET_ITEMS_FOR_DOMAIN',
      payload: { domain: window.location.hostname },
    })) as { items: AutofillItem[] };
    if (res?.items?.length) showAutofillSuggestion(res.items);
  } catch {
    /* ignore */
  }
}

// ── APPROACH 1: Form submit events ────────────────────────────────────────
let formSubmitHandler: ((e: Event) => void) | null = null;
let formObserverSetup = false;

function setupFormSubmitCapture() {
  if (formSubmitHandler) return;
  formSubmitHandler = async (_e: Event) => {
    const passwordInput = findPasswordInput();
    const cardInput = findCardNumberInput();
    const hasPasswordInput = !!passwordInput?.value.trim();
    const hasCardInput = !!cardInput?.value.trim();
    if (!hasPasswordInput && !hasCardInput) return;

    const capturedField = passwordInput ?? cardInput;
    const capturedValue = capturedField!.value;
    const fields = findAllFormInputs();
    const submittedUrl = window.location.href;
    const domain = window.location.hostname;
    const title = document.title || domain;

    await new Promise((r) => setTimeout(r, 1800));

    const newPasswordField = hasPasswordInput
      ? findPasswordInput()
      : findCardNumberInput();
    const sameUrl = window.location.href === submittedUrl;
    const fieldGone = isFieldVisuallyGone(newPasswordField, capturedValue);

    if (sameUrl && !fieldGone) {
      console.log('[VaultX] Form submit: likely failed — skipping');
      return;
    }

    await attemptSave(fields, domain, title, submittedUrl);
  };

  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', formSubmitHandler!);
  });

  if (!formObserverSetup) {
    formObserverSetup = true;
    const observer = new MutationObserver(() => {
      document.querySelectorAll('form').forEach((form) => {
        if (!(form as any).__vaultx_attached) {
          form.addEventListener('submit', formSubmitHandler!);
          (form as any).__vaultx_attached = true;
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('beforeunload', () => observer.disconnect());
  }
}

// ── APPROACH 2: Global click capture (catches div/span buttons) ───────────
function setupGlobalClickCapture() {
  document.addEventListener(
    'click',
    async (e) => {
      const target = e.target as HTMLElement;
      const text = (target.textContent || '').toLowerCase().trim().slice(0, 50);

      const isLoginAction =
        text.includes('sign in') ||
        text.includes('log in') ||
        text.includes('login') ||
        text.includes('sign up') ||
        text.includes('register') ||
        text.includes('create account') ||
        text.includes('continue') ||
        text.includes('next') ||
        text.includes('submit') ||
        text.includes('get started') ||
        text.includes('join') ||
        (target as HTMLInputElement).type === 'submit' ||
        target.closest('button[type="submit"]') !== null ||
        target.closest('input[type="submit"]') !== null ||
        target.getAttribute('role') === 'button';

      if (!isLoginAction) return;

      const passwordInput = findPasswordInput();
      if (!passwordInput?.value.trim()) return;

      const capturedValue = passwordInput.value;
      const fields = findAllFormInputs();
      const submittedUrl = window.location.href;
      const domain = window.location.hostname;
      const title = document.title || domain;

      const hasIdentifier = fields.some(
        (f) => f.name === 'email' || f.name === 'username'
      );
      if (!hasIdentifier) return;

      await new Promise((r) => setTimeout(r, 2000));

      const newPwField = findPasswordInput();
      const sameUrl = window.location.href === submittedUrl;
      const fieldGone = isFieldVisuallyGone(newPwField, capturedValue);

      if (sameUrl && !fieldGone) {
        console.log('[VaultX] Click capture: likely failed — skipping');
        return;
      }

      await attemptSave(fields, domain, title, submittedUrl, true);
    },
    true
  ); // capture phase — fires before button's own handler
}

// ── APPROACH 3: pagehide capture (navigation-based logins) ────────────────
function setupNavigationCapture() {
  window.addEventListener('pagehide', async () => {
    const passwordInput = findPasswordInput();
    if (!passwordInput?.value.trim()) return;
    const fields = findAllFormInputs();
    const hasIdentifier = fields.some(
      (f) => f.name === 'email' || f.name === 'username'
    );
    if (!hasIdentifier) return;
    await storePendingCapture(
      fields,
      window.location.hostname,
      document.title || window.location.hostname,
      window.location.href,
      passwordInput.value
    );
  });
}

// ── APPROACH 4: Watch for dynamically added password fields ───────────────
function setupPasswordFieldWatcher() {
  // Watch existing fields immediately
  document
    .querySelectorAll<HTMLInputElement>('input[type="password"]')
    .forEach((inp) => {
      if (!(inp as any).__vaultx_pw_watched) {
        (inp as any).__vaultx_pw_watched = true;
      }
    });

  // MutationObserver to catch SPAs adding login forms
  const observer = new MutationObserver(() => {
    const pwInput = findPasswordInput();
    if (pwInput && !(pwInput as any).__vaultx_pw_watched) {
      (pwInput as any).__vaultx_pw_watched = true;
      // New password field appeared — check for autofill suggestion
      if (!document.getElementById('vaultx-autofill-suggestion')) {
        setTimeout(checkAutofillSuggestion, 300);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
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

// ── Init ──────────────────────────────────────────────────────────────────
if (!isExcluded) {
  // All 4 approaches run simultaneously for maximum site coverage
  setupFormSubmitCapture(); // traditional form submit
  setupGlobalClickCapture(); // any click that looks like a login action
  setupNavigationCapture(); // page navigation (pagehide)
  setupPasswordFieldWatcher(); // dynamically added forms (SPAs)

  // Check if previous page stored a pending capture (navigation logins)
  checkPendingCaptureOnLoad();

  // Check for autofill suggestion on load
  setTimeout(checkAutofillSuggestion, 1000);

  // Also check after a delay for SPAs that render login forms late
  setTimeout(checkAutofillSuggestion, 3000);
}
