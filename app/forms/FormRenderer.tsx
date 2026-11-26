'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fillTemplate, type FormDef, type FormField } from '@/lib/form-defs';

/**
 * Renders any admin-defined form: GitHub sign-in, then the fields from the
 * definition, then the thank-you. Identity comes from the session; the
 * student types only the answers. A second visit shows what they answered
 * with an "update" button.
 */
type PublicForm = Pick<FormDef, 'slug' | 'title' | 'subtitle' | 'intro' | 'bullets' | 'thanks' | 'thanksNote' | 'fields' | 'open'>;
interface Viewer { login: string; name: string; avatarUrl: string }
interface Existing { answers: Record<string, string>; createdAt: string; updatedAt: string }

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(140,149,166,0.95)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 16px center',
  backgroundSize: '16px',
} as const;
const fieldClass = 'w-full bg-ground border border-line rounded-2xl px-4 py-3.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100 focus:bg-panel transition-all';
const labelClass = 'block text-xs font-[550] text-ink-soft uppercase tracking-wider';
const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** One funnel event, never awaited and never allowed to throw. Counts only; see lib/usage.ts. */
function track(slug: string, event: string) {
  try {
    let v: string | null = null;
    try { v = localStorage.getItem('ost_visitor'); } catch { /* private mode */ }
    const body = JSON.stringify({ e: event, v });
    const url = `/api/forms/${slug}/event`;
    if (!navigator.sendBeacon?.(url, body)) void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch { /* nothing to do */ }
}

function Field({ f, value, onChange }: { f: FormField; value: string; onChange: (v: string) => void }) {
  const id = `field-${f.key}`;
  if (f.type === 'radio') {
    return (
      <fieldset className="space-y-2">
        <legend className={labelClass}>{f.label}</legend>
        {f.help && <p className="text-ink-soft text-xs">{f.help}</p>}
        <div className="flex flex-wrap gap-2 pt-0.5">
          {(f.options ?? []).map((o) => (
            <label key={o} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${value === o ? 'border-brand-500 bg-brand-0 text-brand-700 font-[550]' : 'border-line text-ink-mid hover:border-line-strong'}`}>
              <input type="radio" name={f.key} value={o} checked={value === o} onChange={() => onChange(o)} className="sr-only" required={f.required} />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={labelClass}>{f.label}{!f.required && <span className="normal-case tracking-normal text-ink-faint"> · optional</span>}</label>
      {f.type === 'select' ? (
        <select id={id} required={f.required} value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} cursor-pointer appearance-none`} style={selectStyle}>
          <option value="" className="bg-ground text-ink">Select {f.label.toLowerCase()}</option>
          {(f.options ?? []).map((o) => <option key={o} value={o} className="bg-ground text-ink">{o}</option>)}
        </select>
      ) : f.type === 'textarea' ? (
        <textarea id={id} required={f.required} maxLength={2000} rows={4} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass} placeholder={f.placeholder} />
      ) : (
        <input id={id} type={f.type === 'email' ? 'email' : 'text'} required={f.required} maxLength={200} autoComplete={f.type === 'email' ? 'email' : f.key === 'name' ? 'name' : undefined} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass} placeholder={f.placeholder} />
      )}
      {f.help && <p className="text-ink-soft text-xs">{f.help}</p>}
    </div>
  );
}

export function FormRenderer({ slug, initial }: { slug: string; initial?: PublicForm }) {
  const [form, setForm] = useState<PublicForm | null>(initial ?? null);
  const [phase, setPhase] = useState<'loading' | 'anonymous' | 'form' | 'done' | 'closed' | 'missing' | 'unavailable'>('loading');
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [existing, setExisting] = useState<Existing | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const signIn = `/api/auth/github?next=${encodeURIComponent(slug === 'interest' ? '/interest' : `/forms/${slug}`)}`;

  useEffect(() => {
    let cancelled = false;
    track(slug, 'open');
    fetch(`/api/forms/${slug}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 404) { setPhase('missing'); return; }
        if (res.status === 503) { setPhase('unavailable'); return; }
        if (data.form) setForm(data.form);
        if (data.form && !data.form.open) { setPhase('closed'); return; }
        if (!res.ok || !data.authenticated) { setPhase('anonymous'); return; }
        setViewer(data.viewer);
        if (data.response) {
          setExisting(data.response);
          setAnswers(data.response.answers);
          setPhase('done');
          track(slug, 'done');
        } else {
          setAnswers((a) => ({ ...a, ...(data.form?.fields?.some((f: FormField) => f.key === 'name') && data.viewer?.name ? { name: data.viewer.name } : {}) }));
          setPhase('form');
          track(slug, 'form');
        }
      })
      .catch(() => { if (!cancelled) setPhase('unavailable'); });
    return () => { cancelled = true; };
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/forms/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(answers) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setPhase('anonymous'); return; }
      if (!res.ok) { setError(data.error ?? 'Could not save your response.'); return; }
      setExisting(data.response);
      setAnswers(data.response.answers);
      setPhase('done');
    } catch {
      setError('A network error occurred. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  const complete = form ? form.fields.every((f) => !f.required || (answers[f.key] ?? '').trim()) : false;

  return (
    <main className="min-h-screen bg-panel flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-brand-100/40 blur-[130px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[250px] bg-violet-100/30 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="bg-ground border border-line rounded-2xl p-8 shadow-card">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-11 h-11 rounded-xl bg-brand-0 border border-violet-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-4 3 4 3m8-6 4 3-4 3M14 4l-4 16" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-[650] text-ink leading-tight">{form?.title ?? 'Form'}</h1>
              {form?.subtitle && <p className="text-ink-soft text-xs mt-0.5">{form.subtitle}</p>}
            </div>
          </div>

          {phase === 'loading' && <p className="text-ink-soft text-sm">Checking your sign-in…</p>}
          {phase === 'missing' && <p className="text-ink-soft text-sm">This form does not exist.</p>}
          {phase === 'closed' && <p className="text-ink-soft text-sm">This form is closed. Thank you to everyone who filled it in.</p>}
          {phase === 'unavailable' && (
            <div className="bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm">We could not reach GitHub to check your sign-in. Refresh in a moment.</div>
          )}

          {phase === 'anonymous' && form && (
            <div className="space-y-5">
              {form.intro && <p className="text-ink-mid text-sm leading-relaxed">{form.intro}</p>}
              {form.bullets && form.bullets.length > 0 && (
                <ul className="text-ink-soft text-sm space-y-1.5">{form.bullets.map((b) => <li key={b}>· {b}</li>)}</ul>
              )}
              <a href={signIn} onClick={() => track(slug, 'signin')} className="w-full bg-brand-solid hover:bg-brand-solid-hover text-white font-[550] py-3.5 rounded-2xl transition-all shadow-brand-btn hover:-translate-y-0.5 flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
                </svg>
                Sign in with GitHub to continue
              </a>
            </div>
          )}

          {(phase === 'form' || phase === 'done') && viewer && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-violet-0 border border-violet-100 mb-6">
              <img src={viewer.avatarUrl} alt="" className="w-10 h-10 rounded-full ring-2 ring-violet-100 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-[550] text-ink truncate">{viewer.name || viewer.login}</div>
                <div className="text-violet-600 text-xs font-mono">@{viewer.login}</div>
              </div>
              <a href="/api/auth/logout" className="text-xs text-ink-soft hover:text-ink-mid">Not you?</a>
            </div>
          )}

          {phase === 'done' && existing && form && (
            <div className="space-y-5">
              <div className="bg-success-0 border border-success-100 rounded-2xl p-4 text-success-600 text-sm leading-snug">
                <p className="font-[650]">{fillTemplate(form.thanks, existing.answers)}</p>
                {form.thanksNote && <p className="mt-1">{fillTemplate(form.thanksNote, existing.answers)}</p>}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-ink-soft text-xs">Submitted {when(existing.createdAt)}{existing.updatedAt !== existing.createdAt ? ` · updated ${when(existing.updatedAt)}` : ''}</p>
                {form.open && (
                  <button type="button" onClick={() => setPhase('form')} className="text-ink-soft hover:text-ink-mid text-xs font-[550] underline">Update my answers</button>
                )}
              </div>
            </div>
          )}

          {phase === 'form' && form && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {form.fields.map((f) => (
                <Field key={f.key} f={f} value={answers[f.key] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
              ))}
              {error && <div className="bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm leading-snug">{error}</div>}
              <button type="submit" disabled={submitting || !complete} className="w-full bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-[550] py-3.5 rounded-2xl transition-all shadow-brand-btn hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer">
                {submitting ? 'Saving…' : existing ? 'Save changes' : 'Submit'}
              </button>
              {existing && (
                <button type="button" onClick={() => { setPhase('done'); setError(''); }} className="w-full text-ink-soft hover:text-ink-mid text-sm py-1">Cancel</button>
              )}
            </form>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-ink-soft">
          Already contributing? See the{' '}
          <Link href="/contributors" onClick={() => track(slug, 'go:leaderboard')} className="text-violet-600 hover:text-violet-500 underline font-[500]">leaderboard</Link>
          {' '}or{' '}
          <Link href="/join" onClick={() => track(slug, 'go:join')} className="text-violet-600 hover:text-violet-500 underline font-[500]">join the tracker</Link>.
        </div>
      </div>
    </main>
  );
}

/** Sample answers for a preview: first option for choices, placeholder-ish text otherwise. */
function sampleAnswers(form: PublicForm): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of form.fields) {
    if (f.type === 'select' || f.type === 'radio') out[f.key] = f.options?.[0] ?? '';
    else if (f.type === 'email') out[f.key] = 'asha.rao@example.edu';
    else if (f.key === 'name') out[f.key] = 'Asha Rao';
    else out[f.key] = f.placeholder || 'Sample answer';
  }
  return out;
}

/**
 * The form as a student will see it, in its three states, with nothing
 * fetched or saved: for the admin editor. Sample answers fill the fields and
 * the thank-you text.
 */
export function FormPreview({ form }: { form: PublicForm }) {
  const [view, setView] = useState<'intro' | 'form' | 'done'>('intro');
  const [answers, setAnswers] = useState<Record<string, string>>(() => sampleAnswers(form));
  const viewer: Viewer = { login: 'preview-student', name: 'Asha Rao', avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=80' };
  const now = new Date().toISOString();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-full border border-line bg-panel p-0.5 w-fit" role="tablist" aria-label="Preview state">
        {([['intro', 'Before sign-in'], ['form', 'The form'], ['done', 'Thank-you']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-2.5 py-1 rounded-full text-[11.5px] font-[550] transition-colors ${view === k ? 'bg-ground text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>{label}</button>
        ))}
        <span className="px-2 text-[11px] text-ink-faint">preview · nothing is saved</span>
      </div>
      <div className="bg-panel rounded-2xl p-4 md:p-8">
        <div className="mx-auto w-full max-w-lg bg-ground border border-line rounded-2xl p-8 shadow-card">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-11 h-11 rounded-xl bg-brand-0 border border-violet-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-4 3 4 3m8-6 4 3-4 3M14 4l-4 16" /></svg>
            </div>
            <div>
              <h2 className="text-xl font-[650] text-ink leading-tight">{form.title || 'Untitled form'}</h2>
              {form.subtitle && <p className="text-ink-soft text-xs mt-0.5">{form.subtitle}</p>}
            </div>
          </div>

          {view === 'intro' && (
            <div className="space-y-5">
              {form.intro && <p className="text-ink-mid text-sm leading-relaxed">{form.intro}</p>}
              {form.bullets && form.bullets.length > 0 && <ul className="text-ink-soft text-sm space-y-1.5">{form.bullets.map((b) => <li key={b}>· {b}</li>)}</ul>}
              <div className="w-full bg-brand-solid text-white font-[550] py-3.5 rounded-2xl shadow-brand-btn flex items-center justify-center gap-2 opacity-90">Sign in with GitHub to continue</div>
            </div>
          )}

          {view !== 'intro' && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-violet-0 border border-violet-100 mb-6">
              <img src={viewer.avatarUrl} alt="" className="w-10 h-10 rounded-full ring-2 ring-violet-100 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-[550] text-ink truncate">{viewer.name}</div>
                <div className="text-violet-600 text-xs font-mono">@{viewer.login}</div>
              </div>
              <span className="text-xs text-ink-soft">Not you?</span>
            </div>
          )}

          {view === 'form' && (
            <form onSubmit={(e) => { e.preventDefault(); setView('done'); }} className="space-y-5">
              {form.fields.map((f) => <Field key={f.key || f.label} f={f} value={answers[f.key] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />)}
              <button type="submit" className="w-full bg-brand-solid hover:bg-brand-solid-hover text-white font-[550] py-3.5 rounded-2xl shadow-brand-btn flex items-center justify-center gap-2">Submit</button>
            </form>
          )}

          {view === 'done' && (
            <div className="space-y-5">
              <div className="bg-success-0 border border-success-100 rounded-2xl p-4 text-success-600 text-sm leading-snug">
                <p className="font-[650]">{fillTemplate(form.thanks, answers)}</p>
                {form.thanksNote && <p className="mt-1">{fillTemplate(form.thanksNote, answers)}</p>}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-ink-soft text-xs">Submitted {when(now)}</p>
                <span className="text-ink-soft text-xs font-[550] underline">Update my answers</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
