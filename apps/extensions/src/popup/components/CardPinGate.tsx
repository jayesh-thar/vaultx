import { useState } from 'react';
import { MSG } from '../../lib/messages';
import type {
  CheckCardPinExistsResponse,
  CheckHasCardsResponse,
  SetCardPinResponse,
  VerifyCardPinResponse,
} from '../../lib/messages';

interface Props {
  action: 'view' | 'delete'; // what we're protecting
  itemTitle: string; // shown in the header
  onSuccess: () => void; // called when PIN correct
  onCancel: () => void; // called when user dismisses
}

type Step = 'checking' | 'no_pin_no_cards' | 'set_pin' | 'verify_pin';

// 5-minute PIN session
const PIN_DURATION = 5 * 60 * 1000;

async function getPinSessionValid(): Promise<boolean> {
  const r = await chrome.storage.session.get('cardPinVerifiedAt');
  const ts = r.cardPinVerifiedAt as number | undefined;
  return !!ts && Date.now() - ts < PIN_DURATION;
}

export default function CardPinGate({
  action,
  itemTitle,
  onSuccess,
  onCancel,
}: Props) {
  const [step, setStep] = useState<Step>('checking');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState(''); // for set flow only
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Run check on mount
  useState(() => {
    runInitialCheck();
  });

  async function runInitialCheck() {
    // 1. Check if PIN session still valid
    const valid = await getPinSessionValid();
    if (valid) {
      onSuccess();
      return;
    }

    // 2. Check if PIN is set in DB
    const pinRes = await chrome.runtime.sendMessage<
      object,
      CheckCardPinExistsResponse
    >({
      type: MSG.CHECK_CARD_PIN_EXISTS,
    });

    if (pinRes.exists) {
      setStep('verify_pin');
      return;
    }

    // 3. PIN not set — check if user has any cards
    const cardRes = await chrome.runtime.sendMessage<
      object,
      CheckHasCardsResponse
    >({
      type: MSG.CHECK_HAS_CARDS,
    });

    if (cardRes.hasCards) {
      // Has cards but no PIN — data integrity issue, force set
      setStep('set_pin');
    } else {
      // No cards, no PIN — first card being added or viewed
      setStep(action === 'delete' ? 'verify_pin' : 'no_pin_no_cards');
    }
  }

  async function handleSetPin() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    setLoading(true);
    setError('');

    const res = await chrome.runtime.sendMessage<object, SetCardPinResponse>({
      type: MSG.SET_CARD_PIN,
      payload: { pin },
    });
    setLoading(false);

    if (res.success) onSuccess();
    else setError(res.error ?? 'Failed to set PIN');
  }

  async function handleVerifyPin() {
    if (pin.length < 4) {
      setError('Enter your PIN');
      return;
    }
    setLoading(true);
    setError('');

    const res = await chrome.runtime.sendMessage<object, VerifyCardPinResponse>(
      {
        type: MSG.VERIFY_CARD_PIN,
        payload: { pin },
      }
    );
    setLoading(false);

    if (res.success) onSuccess();
    else {
      setError('Incorrect PIN');
      setPin('');
    }
  }

  // ── Checking state ─────────────────────────────────────────────────────────
  if (step === 'checking') {
    return (
      <div style={s.wrap}>
        <p style={s.checkingText}>Checking PIN status...</p>
      </div>
    );
  }

  // ── No PIN, no cards — shouldn't reach here for delete ────────────────────
  if (step === 'no_pin_no_cards') {
    return (
      <div style={s.wrap}>
        <p style={s.label}>No Card PIN set yet</p>
        <p style={s.hint}>
          You need a Card PIN to protect payment cards. Set one now.
        </p>
        <button style={s.primaryBtn} onClick={() => setStep('set_pin')}>
          Set Card PIN
        </button>
        <button style={s.ghostBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  // ── Set new PIN ────────────────────────────────────────────────────────────
  if (step === 'set_pin') {
    return (
      <div style={s.wrap}>
        <div style={s.header}>
          <span style={s.icon}>🔒</span>
          <div>
            <p style={s.title}>Set Card PIN</p>
            <p style={s.subtitle}>{itemTitle}</p>
          </div>
        </div>
        <p style={s.hint}>
          This PIN protects all your payment cards. It's separate from your
          master password.
        </p>
        <div style={s.field}>
          <label style={s.fieldLabel}>PIN (4–8 digits)</label>
          <input
            style={s.pinInput}
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="• • • •"
            value={pin}
            autoFocus
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
            onKeyDown={(e) =>
              e.key === 'Enter' &&
              setConfirmPin !== undefined &&
              document.getElementById('confirm-pin')?.focus()
            }
          />
        </div>
        <div style={s.field}>
          <label style={s.fieldLabel}>Confirm PIN</label>
          <input
            id="confirm-pin"
            style={s.pinInput}
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="• • • •"
            value={confirmPin}
            onChange={(e) => {
              setConfirmPin(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSetPin()}
          />
        </div>
        {error && <p style={s.error}>{error}</p>}
        <div style={s.btnRow}>
          <button
            style={s.primaryBtn}
            onClick={handleSetPin}
            disabled={loading}
          >
            {loading ? 'Setting...' : 'Set PIN & Continue'}
          </button>
          <button style={s.ghostBtn} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Verify existing PIN ────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.icon}>{action === 'delete' ? '🗑️' : '💳'}</span>
        <div>
          <p style={s.title}>
            {action === 'delete' ? 'Confirm Delete' : 'Enter Card PIN'}
          </p>
          <p style={s.subtitle}>{itemTitle}</p>
        </div>
      </div>

      {action === 'delete' && (
        <div style={s.warningBox}>
          ⚠ This will permanently delete this card from your vault.
        </div>
      )}

      <div style={s.field}>
        <label style={s.fieldLabel}>Card PIN</label>
        <input
          style={s.pinInput}
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="• • • •"
          value={pin}
          autoFocus
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''));
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
        />
      </div>
      {error && <p style={s.error}>{error}</p>}
      <div style={s.btnRow}>
        <button
          style={{
            ...s.primaryBtn,
            ...(action === 'delete' ? s.dangerBtn : {}),
          }}
          onClick={handleVerifyPin}
          disabled={loading}
        >
          {loading ? '...' : action === 'delete' ? 'Verify & Delete' : 'Unlock'}
        </button>
        <button style={s.ghostBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <button
        style={s.forgotBtn}
        onClick={() => {
          setError('');
          setPin('');
          // Direct to web app for PIN reset (requires master password there)
          chrome.tabs.create({ url: 'http://localhost:5173/settings' });
        }}
      >
        Forgot PIN? Reset via web app →
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '12px 0',
  },
  header: { display: 'flex', alignItems: 'center', gap: 10 },
  icon: { fontSize: 24, flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  subtitle: { fontSize: 11, color: '#64748b', margin: '2px 0 0' },
  hint: { fontSize: 12, color: '#64748b', lineHeight: 1.5 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  pinInput: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: 22,
    letterSpacing: 10,
    textAlign: 'center' as const,
    outline: 'none',
  },
  btnRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  primaryBtn: {
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: '#10b981',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerBtn: { background: '#dc2626' },
  ghostBtn: {
    padding: '8px 0',
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#64748b',
    fontSize: 13,
    cursor: 'pointer',
  },
  error: { color: '#f87171', fontSize: 12 },
  warningBox: {
    padding: '10px 12px',
    borderRadius: 8,
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    fontSize: 12,
  },
  forgotBtn: {
    background: 'none',
    border: 'none',
    color: '#475569',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'left' as const,
    padding: 0,
  },
  checkingText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center' as const,
  },
};
