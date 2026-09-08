/**
 * lib/rate-limit.ts
 *
 * Minimal sliding-window rate limiter backed by the same KV layer the rest of
 * the app uses (Upstash Redis when configured, JSON files under data/kv/
 * otherwise). No new infrastructure, no new dependencies.
 *
 * This is a best-effort abuse brake, not a precise distributed quota: two
 * concurrent serverless instances can each admit one request over the limit.
 * Treat it as L2/L3 defense (see issue #45) — the provider-side spend cap is
 * the hard ceiling that survives our own bugs.
 */
import { kvGet, kvSet } from './kv';

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (0 when denied). */
  remaining: number;
  /** Seconds until the window resets (0 when allowed). */
  retryAfter: number;
}

interface WindowState {
  count: number;
  resetAt: number; // epoch ms
}

/**
 * Records one hit against `key` and reports whether it fits inside
 * `limit` requests per `windowSeconds`.
 *
 * Key convention: `rl:<scope>:<id>`, e.g. `rl:admin-login:1.2.3.4` or
 * `rl:assistant:user:octocat`. Callers choose the scope and the identity —
 * prefer the authenticated user id over IP wherever a session exists.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  /** Units to charge for this hit. One agent run can cost several provider
   *  calls, so it must be able to reserve them all in a single KV op rather
   *  than pretending to be one request. */
  cost: number = 1
): Promise<RateLimitResult> {
  const now = Date.now();
  const charge = Math.max(1, Math.floor(cost));
  const state = (await kvGet<WindowState>(key)) ?? { count: 0, resetAt: now + windowSeconds * 1000 };

  // Stale window — start a fresh one.
  if (now >= state.resetAt) {
    const fresh: WindowState = { count: charge, resetAt: now + windowSeconds * 1000 };
    await kvSet(key, fresh, windowSeconds + 5);
    return { allowed: true, remaining: Math.max(0, limit - charge), retryAfter: 0 };
  }

  if (state.count + charge > limit) {
    return {
      allowed: false,
      remaining: Math.max(0, limit - state.count),
      retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    };
  }

  const next: WindowState = { count: state.count + charge, resetAt: state.resetAt };
  const ttl = Math.max(1, Math.ceil((state.resetAt - now) / 1000) + 5);
  await kvSet(key, next, ttl);
  return { allowed: true, remaining: limit - next.count, retryAfter: 0 };
}

/**
 * Best-effort client IP behind the app's known proxies (Cloudflare Tunnel +
 * Traefik on K8s, Vercel's edge network in production). Only ever used as a
 * coarse anonymous bucket key — authenticated limits must key on user id.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Builds a 429 JSON response with a Retry-After header (the app-wide contract). */
export function rateLimitedResponse(retryAfter: number, message?: string): Response {
  return Response.json(
    { error: message ?? 'Too many requests. Please slow down and try again.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
