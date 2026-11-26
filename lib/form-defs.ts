/**
 * lib/form-defs.ts
 *
 * Admin-defined forms: a definition (title, intro, fields, thank-you text,
 * open/closed, add-to-roster) that the public page renders and validates
 * against, and the responses to it. Everything here is pure, so the page
 * and the admin editor can import it; storage is lib/kv-forms.ts.
 *
 * The open-source interest form is the first definition (DEFAULT_FORMS)
 * and is seeded into the store the first time forms are read.
 */

export const FIELD_TYPES = ['text', 'email', 'textarea', 'select', 'radio'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  /** Stable answer key, e.g. "email". Letters, digits, underscores. */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** For select and radio. */
  options?: string[];
  help?: string;
  placeholder?: string;
}

export interface FormDef {
  /** URL segment: /forms/<slug>. Lowercase letters, digits, hyphens. */
  slug: string;
  title: string;
  subtitle?: string;
  /** Shown above the sign-in button, before the student signs in. */
  intro: string;
  /** Short bullet lines under the intro. */
  bullets?: string[];
  /** Thank-you line after submitting. {first} and {name} and any {fieldKey} are filled in. */
  thanks: string;
  thanksNote?: string;
  fields: FormField[];
  open: boolean;
  /** Put the account on the roster on submit, using the batch and campus answers. */
  addToRoster: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FormResponse {
  githubId: number;
  github: string;
  avatarUrl?: string;
  answers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  /** When this response put the student on the roster. */
  rosterAddedAt?: string;
}

/** Roster vocab, so an add-to-roster form can map its answers. */
export const ROSTER_YEARS = ['1st year', '2nd year', '3rd year', '4th year'] as const;
export const ROSTER_CAMPUSES = ['Rishihood', 'ADYPU', 'SVYASA', 'SMRU'] as const;
export type RosterYear = (typeof ROSTER_YEARS)[number];
export type RosterCampus = (typeof ROSTER_CAMPUSES)[number];

export const CHANNEL_OPTIONS = ['WhatsApp', 'Google Spaces', 'Email'] as const;

export const DEFAULT_FORMS: FormDef[] = [
  {
    slug: 'interest',
    title: 'Open Source Interest Form',
    subtitle: 'NST students · sign in with GitHub, fill five fields, done',
    intro:
      'Interested in open source and want to get into summer programmes like GSoC, LFX Mentorship or Summer of Bitcoin? Register here. This only collects your details so we can reach you about sessions, mentors and deadlines.',
    bullets: [
      'Your GitHub account identifies you, so there is nothing to type twice.',
      'We ask for your name, college email, batch, campus, and where you actually read messages.',
      'You can come back and update it any time.',
    ],
    thanks: "Thank you, {first}. You're registered.",
    thanksNote: 'We will reach out to you via mail.',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true, placeholder: 'As on your college ID' },
      { key: 'email', label: 'College email', type: 'email', required: true, placeholder: 'you@your-college-domain', help: 'Your college address, so session invites and programme updates reach you.' },
      { key: 'batch', label: 'Batch', type: 'select', required: true, options: [...ROSTER_YEARS] },
      { key: 'campus', label: 'Campus', type: 'select', required: true, options: [...ROSTER_CAMPUSES] },
      { key: 'channel', label: 'Where do you actually read messages?', type: 'radio', required: true, options: [...CHANNEL_OPTIONS], help: 'Pick the one you’d notice first.' },
    ],
    open: true,
    addToRoster: true,
    createdAt: '2026-11-26T00:00:00.000Z',
    updatedAt: '2026-11-26T00:00:00.000Z',
  },
];

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}
export function keyify(s: string): string {
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return /^[a-z]/.test(k) ? k : `f_${k}`.slice(0, 40);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Checks and normalises a definition from the admin editor. Pure. */
export function validateFormDef(raw: unknown, nowIso = new Date().toISOString()): { ok: true; def: FormDef } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const slug = str(b.slug, 64).toLowerCase();
  if (!SLUG.test(slug)) return { ok: false, error: 'Slug must be lowercase letters, digits and hyphens.' };
  const title = str(b.title, 120);
  if (title.length < 2) return { ok: false, error: 'Give the form a title.' };
  const intro = str(b.intro, 1000);
  const thanks = str(b.thanks, 300) || 'Thank you, {first}. Your response is recorded.';
  const rawFields = Array.isArray(b.fields) ? b.fields : [];
  if (rawFields.length === 0) return { ok: false, error: 'Add at least one field.' };
  if (rawFields.length > 30) return { ok: false, error: 'At most 30 fields.' };
  const fields: FormField[] = [];
  const seen = new Set<string>();
  for (const rf of rawFields) {
    const f = (rf && typeof rf === 'object' ? rf : {}) as Record<string, unknown>;
    const label = str(f.label, 160);
    if (!label) return { ok: false, error: 'Every field needs a label.' };
    const key = str(f.key, 40) || keyify(label);
    if (!KEY.test(key)) return { ok: false, error: `Field key "${key}" must be lowercase letters, digits and underscores, starting with a letter.` };
    if (seen.has(key)) return { ok: false, error: `Two fields share the key "${key}".` };
    seen.add(key);
    const type = (FIELD_TYPES as readonly string[]).includes(String(f.type)) ? (f.type as FieldType) : 'text';
    const field: FormField = { key, label, type, required: f.required !== false };
    if (type === 'select' || type === 'radio') {
      const options = (Array.isArray(f.options) ? f.options : String(f.options ?? '').split(/\r?\n|,/))
        .map((o) => str(o, 80))
        .filter(Boolean);
      const unique = [...new Set(options)];
      if (unique.length < 2) return { ok: false, error: `"${label}" needs at least two options.` };
      if (unique.length > 40) return { ok: false, error: `"${label}" has too many options (40 max).` };
      field.options = unique;
    }
    const help = str(f.help, 200);
    if (help) field.help = help;
    const placeholder = str(f.placeholder, 120);
    if (placeholder) field.placeholder = placeholder;
    fields.push(field);
  }
  const addToRoster = b.addToRoster === true;
  if (addToRoster && (!seen.has('batch') || !seen.has('campus'))) {
    return { ok: false, error: 'Add-to-roster needs fields with the keys "batch" and "campus".' };
  }
  const bullets = (Array.isArray(b.bullets) ? b.bullets : String(b.bullets ?? '').split(/\r?\n/)).map((x) => str(x, 200)).filter(Boolean).slice(0, 6);
  const def: FormDef = {
    slug,
    title,
    intro,
    thanks,
    fields,
    open: b.open !== false,
    addToRoster,
    createdAt: typeof b.createdAt === 'string' && b.createdAt ? b.createdAt : nowIso,
    updatedAt: nowIso,
  };
  const subtitle = str(b.subtitle, 160);
  if (subtitle) def.subtitle = subtitle;
  if (bullets.length) def.bullets = bullets;
  const thanksNote = str(b.thanksNote, 400);
  if (thanksNote) def.thanksNote = thanksNote;
  return { ok: true, def };
}

/** Checks a submission against the definition; returns normalised answers. Pure. */
export function validateAnswers(def: FormDef, raw: unknown): { ok: true; answers: Record<string, string> } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const f of def.fields) {
    let v = typeof b[f.key] === 'string' ? (b[f.key] as string).trim() : '';
    if (f.type === 'textarea') v = v.slice(0, 2000);
    else v = v.replace(/\s+/g, ' ').slice(0, 200);
    if (!v) {
      if (f.required) return { ok: false, error: f.type === 'select' || f.type === 'radio' ? `Choose ${f.label.toLowerCase().replace(/\?$/, '')}.` : `Enter ${f.label.toLowerCase()}.` };
      continue;
    }
    if (f.type === 'email') {
      v = v.toLowerCase();
      if (!EMAIL.test(v)) return { ok: false, error: `Enter a valid ${f.label.toLowerCase()}.` };
    }
    if ((f.type === 'select' || f.type === 'radio') && !(f.options ?? []).includes(v)) {
      return { ok: false, error: `Choose one of the options for ${f.label.toLowerCase().replace(/\?$/, '')}.` };
    }
    answers[f.key] = v;
  }
  return { ok: true, answers };
}

/** Fills {first}, {name} and {<fieldKey>} in thank-you text. Pure. */
export function fillTemplate(text: string, answers: Record<string, string>): string {
  const name = answers.name ?? '';
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k === 'first' ? (name.split(' ')[0] || 'there') : (answers[k] ?? '')));
}

/** Roster year/campus from a response, when the answers match the roster vocab. Pure. */
export function rosterDetails(answers: Record<string, string>): { year?: RosterYear; campus?: RosterCampus } {
  const year = (ROSTER_YEARS as readonly string[]).includes(answers.batch ?? '') ? (answers.batch as RosterYear) : undefined;
  const campus = (ROSTER_CAMPUSES as readonly string[]).includes(answers.campus ?? '') ? (answers.campus as RosterCampus) : undefined;
  return { year, campus };
}

/** RFC 4180 CSV of a form's responses, oldest first, one column per field. Pure. */
export function responsesCsv(def: FormDef, rows: FormResponse[]): string {
  const cell = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['github', ...def.fields.map((f) => f.key), 'submitted_at', 'updated_at', 'github_id'];
  const lines = [...rows]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => [r.github, ...def.fields.map((f) => r.answers[f.key]), r.createdAt, r.updatedAt, r.githubId].map(cell).join(','));
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}
