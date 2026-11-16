/**
 * lib/socials-verify.ts  (server only: uses node:dns)
 *
 * Checks that the accounts a student is about to show on their page really
 * exist, using whatever each platform exposes without credentials. A link
 * that fails its check is rejected with a message naming the field; a link
 * that passes is stored with a verifiedAt timestamp and shown with a tick.
 *
 * What can and cannot be checked, as probed on 2026-11-16:
 *   X          publish.x.com/oembed answers 200 for a real handle, 404 otherwise.
 *   YouTube    youtube.com/@handle answers 200 or 404.
 *   Telegram   t.me/handle always answers 200, but only a real account's page
 *              carries the tgme_page_title block.
 *   Email      the domain must publish MX records.
 *   Website    must resolve to a public address and answer HTTP.
 *   LinkedIn   answers 200 for a real profile and 999 (bot wall) otherwise,
 *              but 999 is also what it sends when it simply dislikes the
 *              client, so 999 is treated as "could not check", never as "no
 *              such profile". 404 is a definite no.
 *   Instagram  answers 200 for everything (login wall): format check only.
 *   Discord    has no public lookup: format check only.
 *
 * Every network call has a short timeout and never follows redirects, so a
 * student's website cannot bounce the server onto an internal address.
 */
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import type { SocialPlatform } from './socials-shared';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export interface VerifyDeps {
  fetch?: Fetcher;
  resolveMx?: (domain: string) => Promise<unknown[]>;
  lookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  timeoutMs?: number;
  now?: () => Date;
}

export interface VerifyResult {
  /** Field → message, for links that definitely do not exist or cannot be reached. */
  errors: Partial<Record<SocialPlatform, string>>;
  /** Field → ISO time, for links a platform confirmed. */
  verifiedAt: Partial<Record<SocialPlatform, string>>;
}

const UA = 'Mozilla/5.0 (compatible; oss-tracker-link-check; +https://oss-tracker.nstsdc.org)';

/** Addresses a student's website must not point the server at. */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier NAT
    if (a >= 224) return false; // multicast, reserved, broadcast
    return true;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return false;
    if (/^f[cd]/.test(lower)) return false; // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return false; // fe80::/10 link local
    if (lower.startsWith('::ffff:')) return isPublicAddress(lower.slice(7)); // mapped IPv4
    return true;
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.cluster.local') ||
    h.endsWith('.svc') ||
    !h.includes('.')
  );
}

async function fetchWithTimeout(fetcher: Fetcher, url: string, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      redirect: 'manual',
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

const handleOf = (url: string) => url.split('/').pop()?.replace(/^@/, '') ?? '';

type Outcome = { ok: true } | { ok: false; error: string } | { skip: true };

async function checkX(url: string, f: Fetcher, t: number): Promise<Outcome> {
  const h = handleOf(url);
  try {
    const res = await fetchWithTimeout(f, `https://publish.x.com/oembed?url=${encodeURIComponent(`https://x.com/${h}`)}`, t);
    if (res.status === 200) return { ok: true };
    if (res.status === 404) return { ok: false, error: `No X account called @${h}.` };
    return { ok: false, error: 'Could not reach X to check this handle. Try again in a minute.' };
  } catch {
    return { ok: false, error: 'Could not reach X to check this handle. Try again in a minute.' };
  }
}

async function checkYouTube(url: string, f: Fetcher, t: number): Promise<Outcome> {
  const h = handleOf(url);
  try {
    const res = await fetchWithTimeout(f, `https://www.youtube.com/@${h}`, t);
    if (res.status === 404) return { ok: false, error: `No YouTube channel called @${h}.` };
    if (res.status >= 200 && res.status < 400) return { ok: true };
    return { ok: false, error: 'Could not reach YouTube to check this channel. Try again in a minute.' };
  } catch {
    return { ok: false, error: 'Could not reach YouTube to check this channel. Try again in a minute.' };
  }
}

async function checkTelegram(url: string, f: Fetcher, t: number): Promise<Outcome> {
  const h = handleOf(url);
  try {
    const res = await fetchWithTimeout(f, `https://t.me/${h}`, t);
    if (res.status !== 200) return { ok: false, error: 'Could not reach Telegram to check this handle. Try again in a minute.' };
    const body = await res.text();
    return body.includes('tgme_page_title') ? { ok: true } : { ok: false, error: `No Telegram account called @${h}.` };
  } catch {
    return { ok: false, error: 'Could not reach Telegram to check this handle. Try again in a minute.' };
  }
}

async function checkLinkedIn(url: string, f: Fetcher, t: number): Promise<Outcome> {
  try {
    const res = await fetchWithTimeout(f, url, t);
    if (res.status === 200) return { ok: true };
    if (res.status === 404) return { ok: false, error: 'LinkedIn has no profile at that address.' };
    return { skip: true }; // 999 bot wall, redirects to the auth wall, etc.
  } catch {
    return { skip: true };
  }
}

async function checkEmail(email: string, resolveMx: NonNullable<VerifyDeps['resolveMx']>): Promise<Outcome> {
  const domain = email.split('@')[1];
  try {
    const mx = await resolveMx(domain);
    return mx.length > 0 ? { ok: true } : { ok: false, error: `${domain} does not accept email.` };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { ok: false, error: `${domain} does not accept email.` };
    return { ok: false, error: 'Could not look up that email domain. Try again in a minute.' };
  }
}

async function checkWebsite(url: string, f: Fetcher, lookup: NonNullable<VerifyDeps['lookup']>, t: number): Promise<Outcome> {
  const { hostname } = new URL(url);
  if (isBlockedHostname(hostname)) return { ok: false, error: 'Use a public website address.' };
  try {
    const addrs = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname);
    if (addrs.length === 0 || addrs.some((a) => !isPublicAddress(a.address))) {
      return { ok: false, error: 'Use a public website address.' };
    }
  } catch {
    return { ok: false, error: 'That website address does not resolve.' };
  }
  try {
    const res = await fetchWithTimeout(f, url, t);
    if (res.status >= 200 && res.status < 400) return { ok: true };
    if (res.status === 404 || res.status === 410) return { ok: false, error: 'That page does not exist on the site.' };
    return { ok: false, error: `The site answered ${res.status}. Check the address.` };
  } catch {
    return { ok: false, error: 'That website did not respond.' };
  }
}

/**
 * Checks every link in parallel. Platforms that cannot be checked
 * (Instagram, Discord) and LinkedIn's bot wall produce neither an error nor
 * a verifiedAt: they are shown on format alone.
 */
export async function verifyLinks(
  links: Partial<Record<SocialPlatform, string>>,
  deps: VerifyDeps = {},
): Promise<VerifyResult> {
  const f: Fetcher = deps.fetch ?? ((u, i) => fetch(u, i));
  const resolveMx = deps.resolveMx ?? ((d: string) => dns.resolveMx(d));
  const lookup = deps.lookup ?? ((h: string) => dns.lookup(h, { all: true }));
  const t = deps.timeoutMs ?? 6000;
  const now = (deps.now ?? (() => new Date()))().toISOString();

  const errors: VerifyResult['errors'] = {};
  const verifiedAt: VerifyResult['verifiedAt'] = {};
  const jobs: Array<Promise<void>> = [];
  const run = (platform: SocialPlatform, job: Promise<Outcome>) =>
    jobs.push(
      job.then((o) => {
        if ('skip' in o) return;
        if (o.ok) verifiedAt[platform] = now;
        else errors[platform] = o.error;
      }),
    );

  if (links.x) run('x', checkX(links.x, f, t));
  if (links.youtube) run('youtube', checkYouTube(links.youtube, f, t));
  if (links.telegram) run('telegram', checkTelegram(links.telegram, f, t));
  if (links.linkedin) run('linkedin', checkLinkedIn(links.linkedin, f, t));
  if (links.email) run('email', checkEmail(links.email, resolveMx));
  if (links.website) run('website', checkWebsite(links.website, f, lookup, t));

  await Promise.all(jobs);
  return { errors, verifiedAt };
}
