import { useState } from 'react';
import type { DecryptedVaultItem } from '../pages/Dashboard';

interface Props {
  item: DecryptedVaultItem;
  onEdit: () => void;
  onDelete: () => void;
}

export default function VaultItemCard({ item, onEdit, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(item.payload.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDelete() {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  const initials = item.payload.title.slice(0, 2).toUpperCase();

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'var(--bg-surface)',
        border: '0.5px solid var(--border)',
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-medium"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {item.payload.title}
          </p>
          <p
            className="text-xs truncate mt-0.5"
            style={{ color: 'var(--text-muted)' }}
          >
            {item.payload.username || item.payload.url || '—'}
          </p>
        </div>
        {item.category && (
          <span
            className="text-xs px-2 py-0.5 rounded-md flex-shrink-0"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
            }}
          >
            {item.category}
          </span>
        )}
      </div>

      {/* Password row */}
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <span
          className="text-sm font-mono tracking-widest"
          style={{ color: 'var(--text-secondary)' }}
        >
          ••••••••••••
        </span>
        <button
          onClick={handleCopy}
          className="text-xs font-medium"
          style={{ color: copied ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-2 pt-2"
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        <button
          onClick={onEdit}
          className="flex-1 text-xs py-1.5 rounded-lg"
          style={{
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
          }}
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="flex-1 text-xs py-1.5 rounded-lg transition-all"
          style={{
            color: confirmDelete ? '#fff' : 'var(--danger)',
            background: confirmDelete ? 'var(--danger)' : 'transparent',
            border: '0.5px solid var(--danger)',
          }}
        >
          {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
