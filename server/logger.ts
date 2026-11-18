import { db, uuid } from './db.ts';

const SENSITIVE_KEY_PATTERN = /(password|token|secret|api_?key|authorization|cookie|credential|hash)/i;

function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeMetadata(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function logOperationalEvent(params: {
  level?: 'info' | 'warn' | 'error';
  eventType: string;
  message: string;
  route?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const level = params.level || 'info';
  const safeMeta = sanitizeMetadata(params.metadata || {});
  const payload = {
    ts: new Date().toISOString(),
    level,
    eventType: params.eventType,
    message: params.message,
    route: params.route || null,
    userId: params.userId || null,
    metadata: safeMeta,
  };

  if (level === 'error') {
    console.error('[UGABYTE_OPS]', JSON.stringify(payload));
  } else if (level === 'warn') {
    console.warn('[UGABYTE_OPS]', JSON.stringify(payload));
  }

  try {
    db.prepare(
      `INSERT INTO operational_logs (id, level, event_type, message, route, user_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      level,
      params.eventType,
      params.message,
      params.route || null,
      params.userId || null,
      JSON.stringify(safeMeta)
    );
  } catch {
    // Never throw from operational logger
  }
}
