/**
 * lib/same-origin.ts
 *
 * The session cookie is `sameSite: lax`, which is deliberate — students
 * arrive from Discord and WhatsApp links and `strict` would render them
 * signed out on arrival. But `lax` is same-*site*, not same-*origin*, and
 * `k8s/04-ingress.yaml` documents wildcard `*.nstsdc.org` DNS: a sibling
 * subdomain counts as same-site and would carry the cookie along.
 *
 * So endpoints that spend money get an explicit origin check. No CSRF token:
 * against `lax` plus the two headers below it buys nothing on endpoints
 * whose only side effect is quota consumption, and it would cost a token
 * mint, a store and a rotation story.
 */
import { getPublicOrigin } from './request-origin';

/**
 * True when the request plausibly came from our own pages (or from a
 * non-browser client such as curl, which sends neither header).
 *
 * `Sec-Fetch-Site` is a forbidden header name, so page JavaScript cannot
 * forge it — when the browser sends it, it is authoritative. `Origin` is the
 * fallback, compared against the *public* origin because Traefik and the
 * Cloudflare Tunnel rewrite Host on the way in.
 */
export function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';

  const origin = request.headers.get('origin');
  if (origin) return origin === getPublicOrigin(request);

  // Neither header: not a browser. curl and server-to-server callers still
  // have to get past authentication, which is the real gate.
  return true;
}
