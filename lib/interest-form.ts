/**
 * lib/interest-form.ts
 *
 * The open-source interest form's shape, options, validation and CSV:
 * pure, so client components can import it without pulling the KV store
 * (and Node's fs) into the browser bundle. Storage is lib/kv-interest.ts.
 */
export const BATCHES = ['1st year', '2nd year', '3rd year', '4th year'] as const;
export const CAMPUSES = ['Rishihood', 'ADYPU', 'SVYASA', 'SMRU'] as const;
export type Batch = (typeof BATCHES)[number];
export type Campus = (typeof CAMPUSES)[number];
/** Where the student says they actually read messages; one answer. */
export const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'gchat', label: 'Google Spaces' },
  { key: 'email', label: 'Email' },
] as const;
export type Channel = (typeof CHANNELS)[number]['key'];
export const channelLabel = (key: string): string => CHANNELS.find((c) => c.key === key)?.label ?? key;

export interface InterestRegistration {
  /** GitHub's numeric account id; the row's identity. */
  githubId: number;
  github: string;
  avatarUrl?: string;
  name: string;
  email: string;
  batch: Batch;
  campus: Campus;
  /** The channel they said they read; absent on rows from before the question existed. */
  channel?: Channel;
  createdAt: string;
  updatedAt: string;
  /** When this registration put the student on the roster (absent if they
   *  were already on it, or the roster was unavailable at the time). */
  rosterAddedAt?: string;
}

export interface InterestInput {
  name: string;
  email: string;
  batch: Batch;
  campus: Campus;
  channel: Channel;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Checks and normalises the fields the student types. Pure. */
export function validateInterestInput(body: unknown): { ok: true; input: InterestInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const batch = typeof b.batch === 'string' ? b.batch : '';
  const campus = typeof b.campus === 'string' ? b.campus : '';
  const channel = typeof b.channel === 'string' ? b.channel : '';
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'Enter your full name (2 to 80 characters).' };
  if (!EMAIL.test(email) || email.length > 120) return { ok: false, error: 'Enter a valid email address.' };
  if (!(BATCHES as readonly string[]).includes(batch)) return { ok: false, error: 'Choose your batch.' };
  if (!(CAMPUSES as readonly string[]).includes(campus)) return { ok: false, error: 'Choose your campus.' };
  if (!CHANNELS.some((c) => c.key === channel)) return { ok: false, error: 'Tell us where you actually read messages.' };
  return { ok: true, input: { name, email, batch: batch as Batch, campus: campus as Campus, channel: channel as Channel } };
}

/** RFC 4180 CSV of every registration, oldest first. Pure. */
export function interestCsv(list: InterestRegistration[]): string {
  const cell = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['name', 'email', 'github', 'batch', 'campus', 'reads_messages_on', 'registered_at', 'updated_at', 'github_id'];
  const rows = [...list]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => [r.name, r.email, r.github, r.batch, r.campus, r.channel ? channelLabel(r.channel) : '', r.createdAt, r.updatedAt, r.githubId].map(cell).join(','));
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
