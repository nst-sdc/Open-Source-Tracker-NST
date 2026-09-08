/**
 * lib/audit-log.ts
 *
 * Append-only, TTL-bound audit log in KV for security-relevant events
 * (admin logins, guardrail verdicts, rate-limit spikes). Capped at 200
 * entries per key so a flood can't grow storage without bound. Reads are
 * for admin/debugging use only — never exposed to clients or the model.
 */
import { kvGet, kvSet } from './kv';

export interface AuditEvent {
  at: string; // ISO timestamp
  event: string; // e.g. 'admin.login.success'
  detail?: string; // no secrets, no tokens, no PII beyond a login name
}

const MAX_ENTRIES = 200;
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function logEvent(key: string, event: string, detail?: string): Promise<void> {
  try {
    const existing = (await kvGet<AuditEvent[]>(`audit:${key}`)) ?? [];
    const next = [...existing.slice(-(MAX_ENTRIES - 1)), { at: new Date().toISOString(), event, detail }];
    await kvSet(`audit:${key}`, next, TTL_SECONDS);
  } catch (error) {
    // Logging must never break the request it observes.
    console.error('[audit] failed to record event:', error);
  }
}
