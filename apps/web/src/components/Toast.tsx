import { useState, useEffect, useCallback } from 'react';
import { registerToastFn, unregisterToastFn } from '../lib/toast';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let counter = 0;

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3500
    );
  }, []);

  useEffect(() => {
    registerToastFn(addToast);
    return () => unregisterToastFn();
  }, [addToast]);

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const colors = { success: '#10B981', error: '#EF4444', info: '#3B82F6' };

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            background: 'var(--bg-elevated)',
            border: `0.5px solid ${colors[t.type]}`,
            color: 'var(--text-primary)',
            animation: 'slideIn 0.2s ease',
            minWidth: 240,
            pointerEvents: 'auto',
          }}
        >
          <span style={{ color: colors[t.type], fontWeight: 600 }}>
            {icons[t.type]}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
