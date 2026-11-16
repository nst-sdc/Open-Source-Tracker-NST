/**
 * lib/socials-shared.ts
 *
 * The parts of lib/socials.ts that are safe in the browser: types, the
 * platform list, validation/normalisation and the display mapping. The
 * profile card is a client component and imports from here; anything that
 * touches the store stays in lib/socials.ts, whose kv import would otherwise
 * drag Node's fs module into the client bundle.
 */

export const SOCIAL_PLATFORMS = [
  'linkedin',
  'x',
  'website',
  'email',
  'discord',
  'telegram',
  'instagram',
  'youtube',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface StudentSocials {
  /** One line about what they are looking for or working on. */
  tagline?: string;
  links: Partial<Record<SocialPlatform, string>>;
  updatedAt: string;
}

export const TAGLINE_MAX = 140;
const HANDLE = /^[A-Za-z0-9_.-]{1,64}$/;

/** Strips a pasted URL or @handle down to the handle for one host. */
function handleFrom(raw: string, hosts: string[], pathPrefix = ''): string | null {
  let s = raw.trim().replace(/^@/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)\/(.+?)\/?$/i);
  if (m) {
    if (!hosts.includes(m[1].toLowerCase())) return null;
    s = m[2];
    if (pathPrefix) {
      if (!s.toLowerCase().startsWith(pathPrefix)) return null;
      s = s.slice(pathPrefix.length);
    }
    s = s.split(/[/?#]/)[0];
  } else if (/[/.]/.test(s) && !hosts.length) {
    return null;
  }
  return HANDLE.test(s) ? s : null;
}

/**
 * Pure. Returns normalised socials or a per-field error map. Unknown fields
 * are ignored; empty strings clear a field.
 */
export function normalizeSocials(
  input: unknown,
): { ok: true; value: StudentSocials } | { ok: false; errors: Partial<Record<SocialPlatform | 'tagline', string>> } {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const rawLinks = (body.links && typeof body.links === 'object' ? body.links : {}) as Record<string, unknown>;
  const errors: Partial<Record<SocialPlatform | 'tagline', string>> = {};
  const links: Partial<Record<SocialPlatform, string>> = {};

  let tagline: string | undefined;
  if (body.tagline !== undefined && body.tagline !== null) {
    if (typeof body.tagline !== 'string') errors.tagline = 'Must be text.';
    else {
      const t = body.tagline.replace(/\s+/g, ' ').trim();
      if (t.length > TAGLINE_MAX) errors.tagline = `Keep it under ${TAGLINE_MAX} characters.`;
      else if (t) tagline = t;
    }
  }

  for (const platform of SOCIAL_PLATFORMS) {
    const raw = rawLinks[platform];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') {
      errors[platform] = 'Must be text.';
      continue;
    }
    const v = raw.trim();
    if (!v) continue;
    if (v.length > 200) {
      errors[platform] = 'Too long.';
      continue;
    }
    switch (platform) {
      case 'linkedin': {
        const h = handleFrom(v, ['linkedin.com'], 'in/');
        if (!h) errors.linkedin = 'Use your LinkedIn profile URL, like linkedin.com/in/your-name.';
        else links.linkedin = `https://www.linkedin.com/in/${h}`;
        break;
      }
      case 'x': {
        const h = handleFrom(v, ['x.com', 'twitter.com']);
        if (!h) errors.x = 'Use your handle, like @name, or your x.com URL.';
        else links.x = `https://x.com/${h}`;
        break;
      }
      case 'telegram': {
        const h = handleFrom(v, ['t.me', 'telegram.me']);
        if (!h) errors.telegram = 'Use your handle, like @name, or your t.me URL.';
        else links.telegram = `https://t.me/${h}`;
        break;
      }
      case 'instagram': {
        const h = handleFrom(v, ['instagram.com']);
        if (!h) errors.instagram = 'Use your handle or your instagram.com URL.';
        else links.instagram = `https://www.instagram.com/${h}`;
        break;
      }
      case 'youtube': {
        const h = handleFrom(v, ['youtube.com'], '@');
        if (!h) errors.youtube = 'Use your channel handle, like @name, or its youtube.com/@name URL.';
        else links.youtube = `https://www.youtube.com/@${h}`;
        break;
      }
      case 'discord': {
        const h = v.replace(/^@/, '');
        if (!/^[a-z0-9_.]{2,32}$/.test(h)) errors.discord = 'Discord usernames are 2–32 lowercase letters, digits, dots or underscores.';
        else links.discord = h;
        break;
      }
      case 'email': {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 120) errors.email = 'That does not look like an email address.';
        else links.email = v.toLowerCase();
        break;
      }
      case 'website': {
        const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
        let url: URL | null = null;
        try {
          url = new URL(withScheme);
        } catch {
          url = null;
        }
        if (!url || !/^https?:$/.test(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
          errors.website = 'Use a full address, like https://your-site.dev.';
        } else {
          url.hash = '';
          links.website = url.toString().replace(/\/$/, '');
        }
        break;
      }
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...(tagline ? { tagline } : {}), links, updatedAt: new Date().toISOString() } };
}

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  /** What to show: a handle or host, never the raw URL. */
  display: string;
  /** null for Discord, which has no profile URL; the username is copied instead. */
  href: string | null;
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  website: 'Website',
  email: 'Email',
  discord: 'Discord',
  telegram: 'Telegram',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

/** Pure. Turns stored links into what the card renders. */
export function socialLinks(socials: StudentSocials | null): SocialLink[] {
  if (!socials) return [];
  const out: SocialLink[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const v = socials.links[platform];
    if (!v) continue;
    const label = PLATFORM_LABEL[platform];
    if (platform === 'email') out.push({ platform, label, display: v, href: `mailto:${v}` });
    else if (platform === 'discord') out.push({ platform, label, display: v, href: null });
    else if (platform === 'website') out.push({ platform, label, display: v.replace(/^https?:\/\/(www\.)?/, ''), href: v });
    else out.push({ platform, label, display: `@${v.split('/').pop()?.replace(/^@/, '')}`, href: v });
  }
  return out;
}

export function hasAnySocial(socials: StudentSocials | null): boolean {
  return socialLinks(socials).length > 0 || Boolean(socials?.tagline);
}
