/**
 * lib/request-origin.ts
 *
 * Behind a reverse proxy (Traefik + Cloudflare Tunnel on the K8s deployment;
 * Vercel's own edge network in production), a Route Handler's `request.url`
 * doesn't reliably reflect the public-facing hostname the browser actually
 * used — it can resolve to the container's own internal bind address
 * instead (observed directly: OAuth redirects resolving to `0.0.0.0:3000`).
 * Standard reverse-proxy headers (X-Forwarded-Host / X-Forwarded-Proto) are
 * the correct way to recover the real public origin; this falls back to
 * request.url's own origin if those aren't present.
 */
export function getPublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
