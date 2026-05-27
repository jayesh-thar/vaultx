import { pool } from '../db/pool';

type AuditEvent =
  | 'register'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'token_reuse'
  | 'google_register_started'
  | 'google_register_complete'
  | 'password_changed';

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
