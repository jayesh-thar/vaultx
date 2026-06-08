import { useEffect, useState } from 'react';
import { MSG } from '../../lib/messages';
import type {
  CheckCardPinExistsResponse,
  CheckHasCardsResponse,
  SetCardPinResponse,
  VerifyCardPinResponse,
} from '../../lib/messages';

interface Props {
  action: 'view' | 'delete';
  itemTitle: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type Step = 'checking' | 'set_pin' | 'verify_pin';

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
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmMode, setConfirmMode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    runInitialCheck();
  }, []);

  async function runInitialCheck() {
    const valid = await getPinSessionValid();
    if (valid) {
      onSuccess();
      return;
    }

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

    const cardRes = await chrome.runtime.sendMessage<
      object,
      CheckHasCardsResponse
    >({
      type: MSG.CHECK_HAS_CARDS,
    });
    // Whether cards exist or not — if no PIN, must set one
    setStep(cardRes.hasCards || !cardRes.hasCards ? 'set_pin' : 'set_pin');
  }

  async function handleSetPin() {
    if (!confirmMode) {
      if (pin.length < 4) {
        setError('At least 4 digits required');
        return;
      }
      setError('');
      setConfirmMode(true);
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match");
      setConfirmPin('');
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
    else setError(res.error ?? 'Failed');
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

  if (step === 'checking') {
    return (
      <div style={s.center}>
        <p style={s.muted}>Checking...</p>
      </div>
    );
  }

  if (step === 'set_pin') {
    return (
      <div style={s.wrap}>
        <p style={s.title}>🔒 {confirmMode ? 'Confirm PIN' : 'Set Card PIN'}</p>
        <p style={s.sub}>
          {confirmMode
            ? 'Re-enter to confirm'
            : `One PIN protects all cards · separate from master password`}
        </p>
        <input
          style={s.input}
          type="password"
          inputMode="numeric"
          placeholder="• • • •"
          maxLength={8}
          value={confirmMode ? confirmPin : pin}
          autoFocus
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            confirmMode ? setConfirmPin(v) : setPin(v);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSetPin()}
        />
        {error && <p style={s.error}>{error}</p>}
        <button style={s.btn} onClick={handleSetPin} disabled={loading}>
          {loading
            ? 'Saving...'
            : confirmMode
              ? 'Confirm & Save'
              : 'Continue →'}
        </button>
        <button
          style={s.ghost}
          onClick={() => {
            if (confirmMode) {
              setConfirmMode(false);
              setConfirmPin('');
              setError('');
            } else onCancel();
          }}
        >
          {confirmMode ? '← Back' : 'Cancel'}
        </button>
      </div>
    );
  }

  // verify_pin
  return (
    <div style={s.wrap}>
      <p style={s.title}>
        {action === 'delete' ? '🗑️ Confirm Delete' : '🔒 Card PIN'}
      </p>
      <p style={s.sub}>
        {action === 'delete'
          ? `Permanently deletes "${itemTitle}"`
          : 'Enter PIN to view card details'}
      </p>
      {action === 'delete' && (
        <div style={s.warning}>⚠ This cannot be undone</div>
      )}
      <input
        style={s.input}
        type="password"
        inputMode="numeric"
        placeholder="• • • •"
        maxLength={8}
        value={pin}
        autoFocus
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, ''));
          setError('');
        }}
        onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
      />
      {error && <p style={s.error}>{error}</p>}
      <button
        style={{
          ...s.btn,
          ...(action === 'delete' ? { background: '#dc2626' } : {}),
          opacity: loading ? 0.7 : 1,
        }}
        onClick={handleVerifyPin}
        disabled={loading}
      >
        {loading ? '...' : action === 'delete' ? 'Delete' : 'Unlock'}
      </button>
      <button style={s.ghost} onClick={onCancel}>
        Cancel
      </button>
      <button
        style={s.forgot}
        onClick={() =>
          chrome.tabs.create({ url: 'http://localhost:5173/settings' })
        }
      >
        Forgot PIN? Reset via web app →
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0' },
  input: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: 18,
    letterSpacing: 6,
    textAlign: 'center',
    outline: 'none',
    width: '100%',
  },
  center: { display: 'flex', justifyContent: 'center', padding: 16 },
  title: { fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: 0 },
  sub: { fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 },
  btn: {
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: '#10b981',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  ghost: {
    padding: '8px 0',
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#64748b',
    fontSize: 13,
    cursor: 'pointer',
  },
  error: { color: '#f87171', fontSize: 12, margin: 0 },
  warning: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    fontSize: 12,
    textAlign: 'center',
  },
  forgot: {
    background: 'none',
    border: 'none',
    color: '#475569',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'left',
  },
  muted: { color: '#64748b', fontSize: 13 },
};
