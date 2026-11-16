'use client';

import { useEffect, useState } from 'react';
import {
  PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  TAGLINE_MAX,
  hasAnySocial,
  socialLinks,
  type SocialPlatform,
  type StudentSocials,
} from '@/lib/socials-shared';

/**
 * "Connect" card on a contributor's page: the links they chose to share.
 * Public to every visitor; editable in place by the student when the GitHub
 * account they are signed in with is this page's account. Hidden entirely
 * when there is nothing to show and the viewer is not the owner.
 */
export function SocialsCard({ username, initial }: { username: string; initial: StudentSocials | null }) {
  const [socials, setSocials] = useState<StudentSocials | null>(initial);
  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => {
        if (d?.authenticated && typeof d.user?.username === 'string') {
          setIsOwner(d.user.username.toLowerCase() === username.toLowerCase());
        }
      })
      .catch(() => undefined);
  }, [username]);

  const links = socialLinks(socials);
  if (!hasAnySocial(socials) && !isOwner) return null;

  return (
    <div className="mt-5 rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11.5px] font-[650] uppercase tracking-wider text-ink-soft">Connect</div>
          {socials?.tagline && <p className="mt-1 text-[13.5px] text-ink-mid leading-relaxed">{socials.tagline}</p>}
        </div>
        {isOwner && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-[12.5px] font-[600] text-brand-600 hover:text-brand-700 transition-colors"
          >
            {hasAnySocial(socials) ? 'Edit' : 'Add your links'}
          </button>
        )}
      </div>

      {editing ? (
        <SocialsForm
          initial={socials}
          onCancel={() => setEditing(false)}
          onSaved={(s) => {
            setSocials(s);
            setEditing(false);
          }}
        />
      ) : links.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.platform}>
              {l.href ? (
                <a
                  href={l.href}
                  target={l.platform === 'email' ? undefined : '_blank'}
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ground px-3 py-1.5 text-[12.5px] font-[550] text-ink hover:border-brand-400 hover:text-brand-600 transition-colors"
                >
                  <PlatformIcon platform={l.platform} />
                  <span className="text-ink-soft">{l.label}</span>
                  <span className="truncate max-w-[180px]">{l.display}</span>
                </a>
              ) : (
                <CopyChip label={l.label} value={l.display} platform={l.platform} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        isOwner && (
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Nothing here yet. Add a LinkedIn, email or Discord so maintainers and classmates can reach you.
          </p>
        )
      )}
    </div>
  );
}

function CopyChip({ label, value, platform }: { label: string; value: string; platform: SocialPlatform }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy username"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ground px-3 py-1.5 text-[12.5px] font-[550] text-ink hover:border-brand-400 hover:text-brand-600 transition-colors"
    >
      <PlatformIcon platform={platform} />
      <span className="text-ink-soft">{label}</span>
      <span>{copied ? 'Copied' : value}</span>
    </button>
  );
}

type FieldErrors = Partial<Record<SocialPlatform | 'tagline', string>>;

const PLACEHOLDER: Record<SocialPlatform, string> = {
  linkedin: 'linkedin.com/in/your-name',
  x: '@handle',
  website: 'https://your-site.dev',
  email: 'you@example.com',
  discord: 'username',
  telegram: '@handle',
  instagram: '@handle',
  youtube: '@channel',
};

function SocialsForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: StudentSocials | null;
  onCancel: () => void;
  onSaved: (s: StudentSocials | null) => void;
}) {
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [links, setLinks] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of SOCIAL_PLATFORMS) out[p] = initial?.links[p] ?? '';
    return out;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage('');
    setErrors({});
    try {
      const res = await fetch('/api/profile/socials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagline, links }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.fields ?? {});
        setMessage(data.error ?? 'Could not save.');
        return;
      }
      onSaved(data.socials ?? null);
    } catch {
      setMessage('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!confirm('Remove all your contact links from this page?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/profile/socials', { method: 'DELETE' });
      if (res.ok) onSaved(null);
      else setMessage('Could not clear.');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-lg border border-line bg-ground px-3 py-2 text-[13px] text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-brand-400';

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <label htmlFor="socials-tagline" className="block text-[11.5px] font-[600] text-ink-soft mb-1">
          One line about you <span className="font-normal">({tagline.length}/{TAGLINE_MAX})</span>
        </label>
        <input
          id="socials-tagline"
          className={input}
          maxLength={TAGLINE_MAX}
          placeholder="Open to internships · learning Rust · ask me about Kubernetes"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
        />
        {errors.tagline && <p className="mt-1 text-[12px] text-error-600">{errors.tagline}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((p) => (
          <div key={p}>
            <label htmlFor={`socials-${p}`} className="block text-[11.5px] font-[600] text-ink-soft mb-1">
              {PLATFORM_LABEL[p]}
            </label>
            <input
              id={`socials-${p}`}
              className={input}
              placeholder={PLACEHOLDER[p]}
              value={links[p]}
              onChange={(e) => setLinks((l) => ({ ...l, [p]: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
            {errors[p] && <p className="mt-1 text-[12px] text-error-600">{errors[p]}</p>}
          </div>
        ))}
      </div>
      <p className="text-[12px] text-ink-soft">
        Shown publicly on this page. Leave a field empty to hide it. Discord shows your username only.
      </p>
      {message && <p className="text-[12.5px] text-error-600">{message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-[600] text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-[550] text-ink-soft hover:text-ink">
          Cancel
        </button>
        {initial && (
          <button type="button" onClick={clearAll} disabled={busy} className="ml-auto text-[12.5px] font-[550] text-error-600 hover:underline">
            Remove all
          </button>
        )}
      </div>
    </form>
  );
}

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  const c = 'w-3.5 h-3.5 shrink-0';
  switch (platform) {
    case 'linkedin':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
        </svg>
      );
    case 'x':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.9 2H22l-7.7 8.8L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8.2-9.4L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 3.9H5.4L17.7 20Z" />
        </svg>
      );
    case 'email':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case 'discord':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.3 5.3A17 17 0 0 0 15.1 4l-.2.4a15 15 0 0 1 3.8 1.9 13.8 13.8 0 0 0-13.4 0A15 15 0 0 1 9.1 4.4L8.9 4a17 17 0 0 0-4.2 1.3C2 9.3 1.3 13.2 1.6 17a17 17 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.8-.9l.4-.3a12.2 12.2 0 0 0 10.9 0l.4.3-1.8.9 1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.3-3-11.7ZM8.7 14.6c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm6.6 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z" />
        </svg>
      );
    case 'telegram':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.9 4.6 18.7 19.7c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.5-.6-.2L6.2 13.4l-4.8-1.5c-1-.3-1-1 .2-1.5L20.5 3.3c.9-.3 1.6.2 1.4 1.3Z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'youtube':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M23 7.2a2.9 2.9 0 0 0-2-2C19.2 4.7 12 4.7 12 4.7s-7.2 0-9 .5a2.9 2.9 0 0 0-2 2C.5 9 .5 12 .5 12s0 3 .5 4.8a2.9 2.9 0 0 0 2 2c1.8.5 9 .5 9 .5s7.2 0 9-.5a2.9 2.9 0 0 0 2-2c.5-1.8.5-4.8.5-4.8s0-3-.5-4.8ZM9.7 15.1V8.9l6 3.1-6 3.1Z" />
        </svg>
      );
    default:
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
  }
}
