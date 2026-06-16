import { useEffect, useState } from 'react';
import { MSG } from '../../lib/messages';
import type { GetVaultItemsResponse } from '../../lib/messages';

type ItemType = 'login' | 'note' | 'card';

interface CustomField {
  id: string;
  label: string;
  value: string;
  type: 'text' | 'password';
}

interface Props {
  type: ItemType;
  onClose: () => void;
  onSaved: (id: string | undefined, title: string) => void;
}

function genPassword(len = 16): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default function AddItemModal({ type, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>();
  const [savedTitle, setSavedTitle] = useState('');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');

  const [content, setContent] = useState('');

  const [cardholder, setCardholder] = useState('');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const [notes, setNotes] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  useEffect(() => {
    chrome.runtime
      .sendMessage<object, GetVaultItemsResponse>({ type: MSG.GET_VAULT_ITEMS })
      .then((res) => {
        if (res.success && res.items) {
          const cats = Array.from(
            new Set(res.items.map((i) => i.category).filter(Boolean))
          ) as string[];
          setCategories(cats);
        }
      });
  }, []);

  function addCustomField() {
    setCustomFields((p) => [
      ...p,
      { id: crypto.randomUUID(), label: '', value: '', type: 'text' },
    ]);
  }
  function updateCustomField(
    id: string,
    key: 'label' | 'value' | 'type',
    val: string
  ) {
    setCustomFields((p) =>
      p.map((f) => (f.id === id ? { ...f, [key]: val } : f))
    );
  }
  function removeCustomField(id: string) {
    setCustomFields((p) => p.filter((f) => f.id !== id));
  }

  async function handleSave() {
    if (!title.trim()) return setError('Title is required');

    // Card-specific validation
    if (type === 'card') {
      if (!number.trim()) return setError('Card number is required');
      if (!/^\d{13,19}$/.test(number.replace(/\s/g, '')))
        return setError('Card number must be 13–19 digits');
      if (!expiry.trim()) return setError('Expiry is required');
      if (!/^\d{2}\/\d{2}$/.test(expiry.trim()))
        return setError('Expiry must be MM/YY format');
      const [mm, yy] = expiry.split('/').map(Number);
      if (mm < 1 || mm > 12) return setError('Month must be 01–12');
      const now = new Date();
      const exp = new Date(2000 + yy, mm - 1, 1);
      if (exp < now) return setError('Card appears to be expired');
      if (cvv && !/^\d{3,4}$/.test(cvv.trim()))
        return setError('CVV must be 3 or 4 digits');
    }

    setError('');
    setSaving(true);
    let itemPayload: Record<string, unknown>;
    if (type === 'login') {
      itemPayload = {
        title,
        username,
        email,
        password,
        url,
        totpSecret: totpSecret || undefined,
        notes,
        favorite: false,
        passwordChangedAt: new Date().toISOString(),
        customFields: customFields.length ? customFields : undefined,
      };
    } else if (type === 'note') {
      itemPayload = {
        title,
        content,
        notes,
        favorite: false,
        customFields: customFields.length ? customFields : undefined,
      };
    } else {
      itemPayload = {
        title,
        cardholder,
        number,
        expiry,
        cvv,
        notes,
        favorite: false,
        customFields: customFields.length ? customFields : undefined,
      };
    }
    if (category.trim()) itemPayload.category = category.trim();

    const res = (await chrome.runtime.sendMessage({
      type: MSG.ADD_VAULT_ITEM,
      payload: { type, payload: itemPayload },
    })) as { success: boolean; id?: string; error?: string };

    setSaving(false);
    if (res.success) {
      if (type === 'card') {
        // Check if PIN already exists; if not, prompt to set one
        const pinRes = (await chrome.runtime.sendMessage({
          type: 'CHECK_CARD_PIN_EXISTS',
        })) as { exists: boolean };

        if (!pinRes.exists) {
          // First card saved, no PIN set — prompt now
          setSavedId(res.id);
          setSavedTitle(title);
          setShowPinSetup(true);
          return; // don't close yet
        }
      }
      onSaved(res.id, title);
      onClose();
    } else {
      setError(res.error ?? 'Failed to save');
    }
  }

  // ADD this new function, right after handleSave:
  async function handlePinSave() {
    if (pinStep === 'enter') {
      if (newPin.length < 4) return setPinError('At least 4 digits required');
      setPinError('');
      setPinStep('confirm');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("PINs don't match");
      setConfirmPin('');
      return;
    }
    setPinSaving(true);
    setPinError('');
    const res = (await chrome.runtime.sendMessage({
      type: 'SET_CARD_PIN',
      payload: { pin: newPin },
    })) as { success: boolean; error?: string };
    setPinSaving(false);
    if (res.success) {
      onSaved(savedId, savedTitle);
      onClose();
    } else {
      setPinError(res.error ?? 'Failed to set PIN');
    }
  }

  const typeLabel = { login: '🔑 Login', note: '📝 Note', card: '💳 Card' }[
    type
  ];

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.header}>
          <p style={s.title}>Add {typeLabel}</p>
          <button style={s.close} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={s.body}>
          {error && <div style={s.error}>⚠ {error}</div>}

          <Field label="Title" value={title} onChange={setTitle} autoFocus />

          {type === 'login' && (
            <>
              <Field label="Username" value={username} onChange={setUsername} />
              <Field label="Email" value={email} onChange={setEmail} />
              <div style={s.field}>
                <label style={s.label}>Password</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ ...s.input, flex: 1 }}
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    style={s.smallBtn}
                    onClick={() => setShowPass((p) => !p)}
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                  <button
                    style={s.smallBtn}
                    onClick={() => setPassword(genPassword())}
                  >
                    🎲
                  </button>
                </div>
              </div>
              <Field
                label="URL"
                value={url}
                onChange={setUrl}
                placeholder="https://example.com"
              />
              <Field
                label="TOTP Secret (optional)"
                value={totpSecret}
                onChange={setTotpSecret}
              />
            </>
          )}

          {type === 'note' && (
            <div style={s.field}>
              <label style={s.label}>Content</label>
              <textarea
                style={{ ...s.input, minHeight: 80, resize: 'vertical' }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          )}

          {type === 'card' && (
            <>
              <Field
                label="Cardholder"
                value={cardholder}
                onChange={setCardholder}
              />
              <Field label="Card Number" value={number} onChange={setNumber} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Field
                    label="Expiry (MM/YY)"
                    value={expiry}
                    onChange={setExpiry}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Field
                    label="CVV"
                    value={cvv}
                    onChange={setCvv}
                    type="password"
                  />
                </div>
              </div>
            </>
          )}

          <div style={s.field}>
            <label style={s.label}>Category</label>
            <input
              style={s.input}
              list="vx-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Work, Personal"
            />
            <datalist id="vx-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div style={s.field}>
            <label style={s.label}>Notes</label>
            <textarea
              style={{ ...s.input, minHeight: 50, resize: 'vertical' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={s.field}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <label style={s.label}>Custom Fields</label>
              <button style={s.smallBtn} onClick={addCustomField}>
                + Add
              </button>
            </div>
            {customFields.map((f) => (
              <div key={f.id} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  placeholder="Label"
                  value={f.label}
                  onChange={(e) =>
                    updateCustomField(f.id, 'label', e.target.value)
                  }
                />
                <input
                  style={{ ...s.input, flex: 1 }}
                  placeholder="Value"
                  type={f.type}
                  value={f.value}
                  onChange={(e) =>
                    updateCustomField(f.id, 'value', e.target.value)
                  }
                />
                <button
                  style={s.smallBtn}
                  onClick={() => removeCustomField(f.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {showPinSetup && (
        <div style={{ ...s.overlay, background: 'rgba(15,23,42,0.98)' }}>
          <div style={s.modal}>
            <div style={s.header}>
              <p style={s.title}>🔒 Set Card PIN</p>
            </div>
            <div style={{ ...s.body, justifyContent: 'center', gap: 16 }}>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#10b98122',
                  border: '1px solid #10b981',
                  fontSize: 12,
                  color: '#a7f3d0',
                  lineHeight: 1.5,
                }}
              >
                ✓ Card saved! Set a PIN to protect all your payment cards. This
                PIN is separate from your master password.
              </div>

              <div style={s.field}>
                <label style={s.label}>
                  {pinStep === 'enter' ? 'New PIN (4–8 digits)' : 'Confirm PIN'}
                </label>
                <input
                  style={{
                    ...s.input,
                    letterSpacing: 8,
                    textAlign: 'center',
                    fontSize: 18,
                  }}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinStep === 'enter' ? newPin : confirmPin}
                  autoFocus
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    pinStep === 'enter' ? setNewPin(v) : setConfirmPin(v);
                    setPinError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handlePinSave()}
                  placeholder="• • • •"
                />
              </div>

              {pinError && <div style={s.error}>⚠ {pinError}</div>}
            </div>

            <div style={s.footer}>
              <button
                style={s.cancelBtn}
                onClick={() => {
                  // Skip PIN — still close and mark saved
                  onSaved(savedId, savedTitle);
                  onClose();
                }}
              >
                Skip for now
              </button>
              <button
                style={s.saveBtn}
                onClick={handlePinSave}
                disabled={pinSaving}
              >
                {pinSaving
                  ? 'Saving...'
                  : pinStep === 'enter'
                    ? 'Continue →'
                    : 'Set PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <input
        style={s.input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.97)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
  },
  modal: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f172a',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    borderBottom: '1px solid #1e293b',
  },
  title: { fontSize: 14, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  close: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: 16,
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '8px 10px',
    borderRadius: 7,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: 13,
    outline: 'none',
  },
  smallBtn: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#94a3b8',
    fontSize: 11,
    cursor: 'pointer',
  },
  error: {
    padding: '8px 10px',
    borderRadius: 7,
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    fontSize: 12,
  },
  footer: {
    display: 'flex',
    gap: 8,
    padding: 14,
    borderTop: '1px solid #1e293b',
  },
  cancelBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg,#10b981,#059669)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
