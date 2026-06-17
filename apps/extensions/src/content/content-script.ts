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

const PENDING_CAPTURE_KEY = 'vaultx_pending_capture';
const CAPTURE_TIMEOUT_MS = 8000;

async function storePendingCapture(
  fields: CapturedField[],
  domain: string,
  title: string,
  url: string
) {
  await chrome.storage.session.set({
    [PENDING_CAPTURE_KEY]: {
      fields,
      domain,
      title,
      url,
      submittedUrl: window.location.href,
      timestamp: Date.now(),
    },
  });
}

async function checkPendingCaptureOnLoad() {
  const r = await chrome.storage.session.get(PENDING_CAPTURE_KEY);
  const pending = r[PENDING_CAPTURE_KEY] as
    | {
        fields: CapturedField[];
        domain: string;
        title: string;
        url: string;
        submittedUrl: string;
        timestamp: number;
      }
    | undefined;

  if (!pending) return;
  await chrome.storage.session.remove(PENDING_CAPTURE_KEY);

  // Too old — abandoned form, discard
  if (Date.now() - pending.timestamp > CAPTURE_TIMEOUT_MS) return;

  // Same URL as when submitted = page didn't navigate = likely a
  // failed login (error shown on same page) → discard, don't save
  const navigated = window.location.href !== pending.submittedUrl;
  if (!navigated) {
    console.log('[VaultX] Login likely failed (no navigation) — not saving');
    return;
  }

  // URL changed = login/register likely succeeded → proceed
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
    payload: {
      fields: pending.fields,
      domain: pending.domain,
      title: pending.title,
      url: pending.url,
    },
  })) as {
    saved: boolean;
    autoSave: boolean;
    id?: string;
    title?: string;
  } | null;

  if (response?.saved) {
    showAutoSaveToast(response.id, response.title || pending.title);
  } else if (response && !response.autoSave) {
    showSaveBanner(pending.fields, pending.domain, pending.title);
  }
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
  const autocomplete = (input.autocomplete ?? '').toLowerCase();
  const combined = `${name} ${id} ${placeholder} ${autocomplete}`;

  if (type === 'email' || combined.includes('email')) return 'email';
  if (type === 'password') return 'password';
  if (
    combined.includes('cardholder') ||
    (combined.includes('card') && combined.includes('name'))
  )
    return 'cardholder';
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

function showAutoSaveToast(
  itemId: string | undefined,
  title: string,
  updated = false
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
  toast.innerHTML = `<span>${action} "${escapeHtml(title.slice(0, 24))}"</span>${
    itemId
      ? '<button id="vx-undo" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;font-weight:600;">Cancel</button>'
      : ''
  }`;
  document.body.appendChild(toast);

  if (itemId) {
    document.getElementById('vx-undo')?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({
        type: 'DELETE_VAULT_ITEM',
        payload: { id: itemId },
      });
      await chrome.storage.session.remove('lastAutoSavedItem');
      toast.remove();
    });
    chrome.storage.session.set({
      lastAutoSavedItem: {
        id: itemId,
        title,
        expiresAt: Date.now() + 5 * 60 * 1000,
      },
    });
  }

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

      try {
        await chrome.runtime.sendMessage({ type: 'CHECK_SESSION' });
      } catch {
        /* ignore */
      }

      await new Promise((r) => setTimeout(r, 200));

      const res = (await chrome.runtime.sendMessage({
        type: 'SAVE_FORM_FIELDS',
        payload: { ...pendingPayload, forceSave: true },
      })) as { saved: boolean; id?: string; title?: string } | null;

      if (res?.saved) {
        showAutoSaveToast(res.id, res.title || title);
      } else {
        showSaveToast('✗ Not logged in to VaultX');
      }
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

// ADD near the other UI functions (after showSaveBanner):

interface AutofillItem {
  id: string;
  payload: {
    title: string;
    username?: string;
    email?: string;
    password?: string;
  };
}

function showAutofillSuggestion(items: AutofillItem[]) {
  document.getElementById('vaultx-autofill-suggestion')?.remove();

  const box = document.createElement('div');
  box.id = 'vaultx-autofill-suggestion';
  box.style.cssText = `
    position:fixed;bottom:20px;right:20px;width:260px;
    background:#1e293b;border:1px solid #334155;border-radius:12px;
    padding:12px;font-family:-apple-system,sans-serif;
    z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,0.5);
  `;

  const list = items
    .slice(0, 3)
    .map((item, i) => {
      const label =
        item.payload.username || item.payload.email || item.payload.title;
      return `<button data-idx="${i}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border-radius:8px;border:none;background:#0f172a;color:#f1f5f9;font-size:12px;cursor:pointer;text-align:left;margin-bottom:6px;">
        <span style="font-size:16px;">🔑</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(label)}</span>
      </button>`;
    })
    .join('');

  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:16px;">🔐</span>
      <p style="font-size:12px;font-weight:600;color:#f1f5f9;margin:0;flex:1;">VaultX — Autofill available</p>
      <button id="vaultx-autofill-close" style="background:none;border:none;color:#475569;cursor:pointer;font-size:14px;">✕</button>
    </div>
    ${list}
  `;

  document.body.appendChild(box);

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
  // Only show if there's a visible password input AND at least one other
  // visible text/email field — this rules out pages where a password field
  // exists but isn't part of a login form yet (e.g. hidden in a SPA)
  const passwordInput = findPasswordInput();
  if (!passwordInput) return;

  const otherInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  ).filter((inp) => {
    if (inp === passwordInput) return false;
    if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(inp.type))
      return false;
    const style = window.getComputedStyle(inp);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (otherInputs.length === 0) return; // password field exists but no accompanying fields

  try {
    const session = (await chrome.runtime.sendMessage({
      type: 'CHECK_SESSION',
    })) as { isLoggedIn: boolean };
    if (!session?.isLoggedIn) return;

    const res = (await chrome.runtime.sendMessage({
      type: 'GET_ITEMS_FOR_DOMAIN',
      payload: { domain: window.location.hostname },
    })) as { items: AutofillItem[] };

    if (res?.items?.length) {
      showAutofillSuggestion(res.items);
    }
  } catch {
    /* extension not available — ignore */
  }
}

// ── Form submit capture ───────────────────────────────────────────────────
let formSubmitHandler: ((e: Event) => void) | null = null;
let observerSetup = false;

function setupFormSubmitCapture() {
  if (formSubmitHandler) return;

  formSubmitHandler = async (_e: Event) => {
    const passwordInput = findPasswordInput();
    const cardInput = findCardNumberInput();

    const hasPassword = !!passwordInput?.value.trim();
    const hasCard = !!cardInput?.value.trim();
    if (!hasPassword && !hasCard) return;

    const capturedValue = (passwordInput ?? cardInput)!.value;
    const fields = findAllFormInputs();
    if (fields.length < 2) return;

    const submittedUrl = window.location.href;

    await new Promise((r) => setTimeout(r, 1200));

    // Re-check whichever field we originally captured (password OR card number)
    const stillThere = hasPassword
      ? findPasswordInput()
      : findCardNumberInput();
    const sameUrl = window.location.href === submittedUrl;
    const sameValue = stillThere?.value === capturedValue;

    if (sameUrl && stillThere && sameValue) {
      console.log(
        '[VaultX] Skipping save — form unchanged after submit (likely failed)'
      );
      return;
    }

    // CHECK SESSION FIRST — don't show banner if not logged in
    try {
      const session = (await chrome.runtime.sendMessage({
        type: 'CHECK_SESSION',
      })) as { isLoggedIn: boolean };
      if (!session?.isLoggedIn) return; // not logged in — silent
    } catch {
      return; // extension not available
    }

    const domain = window.location.hostname;
    const title = document.title || domain;

    const response = (await chrome.runtime.sendMessage({
      type: 'SAVE_FORM_FIELDS',
      payload: { fields, domain, title, url: window.location.href },
    })) as {
      saved: boolean;
      autoSave: boolean;
      id?: string;
      title?: string;
    } | null;

    if (response?.saved) {
      showAutoSaveToast(
        response.id,
        response.title || title,
        (response as any).updated
      );
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
  setTimeout(checkAutofillSuggestion, 1000);
}
