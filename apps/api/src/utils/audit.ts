import { pool } from '../db/pool';

type AuditEvent =
  | 'register'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'vault_access'
  | 'token_reuse';

export interface AuditMeta {
  ip?: string;
  userAgent?: string;
  success?: boolean;
  reason?: string;
}

// Fire and forget — never awaited, never blocks response
export function logAuditEvent(
  userId: string | null,
  eventType: AuditEvent,
  metadata: AuditMeta
): void {
  pool
    .query(
      `INSERT INTO audit_logs (user_id, event_type, metadata)
       VALUES ($1, $2, $3)`,
      [userId, eventType, JSON.stringify(metadata)]
    )
    .catch((err) => {
      // Log to console but never throw — audit failure must not affect user
      console.error('Audit log failed:', err);
    });
}
