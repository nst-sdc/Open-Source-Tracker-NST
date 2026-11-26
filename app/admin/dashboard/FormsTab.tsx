'use client';

import { useEffect, useState } from 'react';
import { FIELD_TYPES, keyify, slugify, type FormDef, type FormField, type FormResponse } from '@/lib/form-defs';
import type { FormUsage } from '@/lib/usage';
import { FormPreview } from '@/app/forms/FormRenderer';

/**
 * Forms: every admin-defined form, its responses (table, CSV, remove) and
 * its funnel, plus an editor to create or change a definition. The
 * interest form is built in and can be edited or closed, not deleted.
 */
type FormRow = FormDef & { responses: number };
type ResponseRow = FormResponse & { onRoster?: boolean };

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '');
const input = 'bg-ground border border-line rounded-lg px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:border-line-strong w-full';

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl px-4 py-3 min-w-[9rem]">
      <div className="text-ink-soft text-xs">{label}</div>
      <div className="text-ink text-2xl font-[600] tabular-nums mt-0.5">{value.toLocaleString('en-IN')}</div>
      {note && <div className="text-ink-soft text-xs mt-0.5">{note}</div>}
    </div>
  );
}

type Draft = Omit<FormDef, 'fields' | 'createdAt' | 'updatedAt' | 'bullets'> & { bullets: string; fields: Array<FormField & { optionsText: string }>; createdAt?: string };

const blankDraft = (): Draft => ({
  slug: '', title: '', subtitle: '', intro: '', bullets: '', thanks: "Thank you, {first}. Your response is recorded.", thanksNote: '', open: true, addToRoster: false,
  fields: [{ key: 'name', label: 'Full name', type: 'text', required: true, optionsText: '' }],
});
const toDraft = (f: FormDef): Draft => ({
  ...f, subtitle: f.subtitle ?? '', thanksNote: f.thanksNote ?? '', bullets: (f.bullets ?? []).join('\n'),
  fields: f.fields.map((x) => ({ ...x, optionsText: (x.options ?? []).join(', ') })),
});

const draftToForm = (d: Draft) => ({
  slug: d.slug, title: d.title, subtitle: d.subtitle || undefined, intro: d.intro, bullets: d.bullets.split('\n').map((b) => b.trim()).filter(Boolean),
  thanks: d.thanks, thanksNote: d.thanksNote || undefined, open: d.open,
  fields: d.fields.map(({ optionsText, ...f }) => ({ ...f, key: f.key || keyify(f.label), options: optionsText.split(/\r?\n|,/).map((o) => o.trim()).filter(Boolean) })),
});

function Editor({ draft: initial, onSaved, onCancel }: { draft: Draft; onSaved: (f: FormDef) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setField = (i: number, patch: Partial<Draft['fields'][number]>) => setD((x) => ({ ...x, fields: x.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const move = (i: number, dir: -1 | 1) => setD((x) => {
    const fields = [...x.fields]; const j = i + dir;
    if (j < 0 || j >= fields.length) return x;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    return { ...x, fields };
  });

  async function save() {
    setSaving(true); setError('');
    const body = { ...d, bullets: d.bullets.split('\n'), fields: d.fields.map(({ optionsText, ...f }) => ({ ...f, options: optionsText.split(/\r?\n|,/).map((o) => o.trim()).filter(Boolean) })) };
    const res = await fetch('/api/admin/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Could not save.'); return; }
    onSaved(data.form);
  }

  return (
    <div className="bg-ground border border-line rounded-xl p-5 space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-xs text-ink-soft">Title<input className={`${input} mt-1`} value={d.title} onChange={(e) => set({ title: e.target.value, slug: d.createdAt ? d.slug : slugify(e.target.value) })} /></label>
        <label className="text-xs text-ink-soft">Link (slug) · /forms/<span className="font-mono">{d.slug || '…'}</span>
          <input className={`${input} mt-1 font-mono`} value={d.slug} disabled={!!d.createdAt} onChange={(e) => set({ slug: slugify(e.target.value) })} />
        </label>
        <label className="text-xs text-ink-soft md:col-span-2">Subtitle (under the title)<input className={`${input} mt-1`} value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></label>
        <label className="text-xs text-ink-soft md:col-span-2">Intro (shown before sign-in)<textarea rows={3} className={`${input} mt-1`} value={d.intro} onChange={(e) => set({ intro: e.target.value })} /></label>
        <label className="text-xs text-ink-soft md:col-span-2">Bullet points, one per line<textarea rows={3} className={`${input} mt-1`} value={d.bullets} onChange={(e) => set({ bullets: e.target.value })} /></label>
        <label className="text-xs text-ink-soft">Thank-you line · {'{first}'}, {'{name}'} and any {'{field_key}'} are filled in<input className={`${input} mt-1`} value={d.thanks} onChange={(e) => set({ thanks: e.target.value })} /></label>
        <label className="text-xs text-ink-soft">Thank-you note (optional)<input className={`${input} mt-1`} value={d.thanksNote} onChange={(e) => set({ thanksNote: e.target.value })} /></label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-ink text-sm font-[600]">Fields</span>
          <button type="button" onClick={() => setD((x) => ({ ...x, fields: [...x.fields, { key: '', label: '', type: 'text', required: true, optionsText: '' }] }))} className="text-xs font-[550] text-brand-600 hover:text-brand-500">+ Add field</button>
        </div>
        <div className="space-y-2">
          {d.fields.map((f, i) => (
            <div key={i} className="bg-panel border border-line rounded-lg p-3 grid md:grid-cols-12 gap-2 items-start">
              <input className={`${input} md:col-span-3`} placeholder="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value, key: f.key && f.key !== keyify(f.label) ? f.key : keyify(e.target.value) })} />
              <input className={`${input} md:col-span-2 font-mono`} placeholder="key" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} />
              <select className={`${input} md:col-span-2`} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormField['type'] })}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="md:col-span-1 text-xs text-ink-soft flex items-center gap-1.5 pt-2"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />required</label>
              <div className="md:col-span-3 space-y-1">
                {(f.type === 'select' || f.type === 'radio') && <input className={input} placeholder="Options, comma-separated" value={f.optionsText} onChange={(e) => setField(i, { optionsText: e.target.value })} />}
                <input className={input} placeholder="Help text (optional)" value={f.help ?? ''} onChange={(e) => setField(i, { help: e.target.value })} />
                {(f.type === 'text' || f.type === 'email' || f.type === 'textarea') && <input className={input} placeholder="Placeholder (optional)" value={f.placeholder ?? ''} onChange={(e) => setField(i, { placeholder: e.target.value })} />}
              </div>
              <div className="md:col-span-1 flex md:flex-col gap-1 text-xs text-ink-soft">
                <button type="button" onClick={() => move(i, -1)} title="Move up" className="hover:text-ink">↑</button>
                <button type="button" onClick={() => move(i, 1)} title="Move down" className="hover:text-ink">↓</button>
                <button type="button" onClick={() => setD((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i) }))} title="Remove field" className="hover:text-error-600">✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-ink-mid"><input type="checkbox" checked={d.open} onChange={(e) => set({ open: e.target.checked })} />Open for responses</label>
        <label className="flex items-center gap-2 text-ink-mid" title='Needs fields with the keys "batch" and "campus" whose options match the roster'><input type="checkbox" checked={d.addToRoster} onChange={(e) => set({ addToRoster: e.target.checked })} />Add respondents to the roster</label>
      </div>
      {error && <div className="bg-error-0 border border-error-100 rounded-lg p-3 text-error-600 text-sm">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-50 text-white text-sm font-[550]">{saving ? 'Saving…' : 'Save form'}</button>
        <button type="button" onClick={() => setPreview((p) => !p)} className="px-4 py-2 rounded-lg border border-line text-ink-mid text-sm hover:border-line-strong">{preview ? 'Hide preview' : 'Preview'}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-line text-ink-mid text-sm hover:border-line-strong">Cancel</button>
      </div>
      {preview && <FormPreview key={JSON.stringify(d)} form={draftToForm(d)} />}
    </div>
  );
}

export default function FormsTab() {
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [selected, setSelected] = useState<string>('interest');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ form: FormDef; responses: ResponseRow[]; usage: FormUsage | null } | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [q, setQ] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const [reload, setReload] = useState(0);
  const loadForms = () => setReload((n) => n + 1);
  useEffect(() => {
    fetch('/api/admin/forms')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) setForms(data.forms ?? []);
        else setError(data.error ?? 'Could not load forms.');
      })
      .catch(() => setError('Could not load forms.'));
  }, [reload]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/admin/forms/${selected}?days=${days}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) setDetail({ form: data.form, responses: data.responses ?? [], usage: data.usage ?? null });
        else setError(data.error ?? 'Could not load responses.');
      })
      .catch(() => setError('Could not load responses.'));
  }, [selected, days]);

  async function remove(r: ResponseRow) {
    if (!detail) return;
    if (!confirm(`Remove @${r.github}'s response to "${detail.form.title}"? The roster is not touched.`)) return;
    const res = await fetch(`/api/admin/forms/${detail.form.slug}?githubId=${r.githubId}`, { method: 'DELETE' });
    if (res.ok) {
      setDetail((d) => d && { ...d, responses: d.responses.filter((x) => x.githubId !== r.githubId) });
      setForms((fs) => fs && fs.map((f) => (f.slug === detail.form.slug ? { ...f, responses: f.responses - 1 } : f)));
    } else setError('Could not remove the response.');
  }
  async function deleteForm(slug: string) {
    if (!confirm(`Delete the form "${slug}" and all its responses? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/forms?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'Could not delete.'); return; }
    setSelected('interest');
    loadForms();
  }

  const t = detail?.usage?.totals;
  const needle = q.trim().toLowerCase();
  const shown = (detail?.responses ?? []).filter((r) => !needle || [r.github, ...Object.values(r.answers)].some((v) => v.toLowerCase().includes(needle)));
  const link = (slug: string) => (slug === 'interest' ? '/interest' : `/forms/${slug}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-ink font-[600]">Forms</h2>
          <p className="text-ink-soft text-xs mt-0.5">Sign-in-with-GitHub forms. Share the link; responses, CSV and the funnel are here.</p>
        </div>
        <button type="button" onClick={() => setEditing(blankDraft())} className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[550]">New form</button>
      </div>

      {error && <div className="bg-error-0 border border-error-100 rounded-xl p-3 text-error-600 text-sm flex justify-between"><span>{error}</span><button type="button" onClick={() => setError('')} className="text-xs underline">dismiss</button></div>}

      {editing && <Editor draft={editing} onSaved={(f) => { setEditing(null); setSelected(f.slug); loadForms(); }} onCancel={() => setEditing(null)} />}

      <div className="flex flex-wrap gap-2">
        {(forms ?? []).map((f) => (
          <button key={f.slug} type="button" onClick={() => setSelected(f.slug)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selected === f.slug ? 'border-brand-500 bg-brand-0 text-brand-700 font-[550]' : 'border-line text-ink-mid hover:border-line-strong'}`}>
            {f.title} <span className="tabular-nums text-ink-soft">{f.responses}</span>{!f.open && <span className="ml-1 text-[10px] uppercase text-ink-faint">closed</span>}
          </button>
        ))}
        {forms && forms.length === 0 && <span className="text-ink-soft text-sm">No forms yet.</span>}
      </div>

      {detail && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="text-ink-soft text-xs">
              Link: <a href={link(detail.form.slug)} target="_blank" rel="noreferrer" className="font-mono text-brand-600 hover:underline">{typeof window !== 'undefined' ? window.location.origin : ''}{link(detail.form.slug)}</a>
              {' · '}{detail.form.open ? 'open' : 'closed'}{detail.form.addToRoster ? ' · adds to roster' : ''}
              {detail.responses.length > 0 && detail.form.addToRoster && ` · ${detail.responses.filter((r) => r.onRoster).length} on the roster`}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowPreview((p) => !p)} className="px-3 py-1.5 rounded-lg border border-line text-ink-mid text-sm hover:border-line-strong">{showPreview ? 'Hide preview' : 'Preview'}</button>
              <button type="button" onClick={() => setEditing(toDraft(detail.form))} className="px-3 py-1.5 rounded-lg border border-line text-ink-mid text-sm hover:border-line-strong">Edit form</button>
              <a href={`/api/admin/forms/${detail.form.slug}?format=csv`} className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[550]">Download CSV</a>
              {detail.form.slug !== 'interest' && <button type="button" onClick={() => deleteForm(detail.form.slug)} className="px-3 py-1.5 rounded-lg border border-line text-error-600 text-sm hover:border-error-400">Delete</button>}
            </div>
          </div>

          {showPreview && <FormPreview key={detail.form.updatedAt} form={detail.form} />}

          <div className="bg-ground border border-line rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-ink text-sm font-[600]">How the form is doing</h3>
              <div className="flex items-center gap-1 rounded-full border border-line bg-panel p-0.5" role="tablist" aria-label="Range">
                {([7, 30, 90] as const).map((d) => (
                  <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)} className={`px-2.5 py-1 rounded-full text-[11.5px] font-[550] transition-colors ${days === d ? 'bg-ground text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>{d} days</button>
                ))}
              </div>
            </div>
            {!t ? <p className="text-ink-soft text-xs">No usage counts yet.</p> : (
              <div className="flex flex-wrap gap-3">
                <Tile label="Opened the form" value={detail.usage!.openers} note={`${t.open.toLocaleString('en-IN')} views`} />
                <Tile label="Clicked sign in" value={t.signin} note={pct(t.signin, detail.usage!.openers) && `${pct(t.signin, detail.usage!.openers)} of openers`} />
                <Tile label="Saw the form signed in" value={t.form} note={`${t.done.toLocaleString('en-IN')} returned already submitted`} />
                <Tile label="Submitted" value={t.registered} note={`${t.updated.toLocaleString('en-IN')} updated their answers`} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-soft text-xs">{detail.responses.length} responses</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter responses" className="bg-ground border border-line rounded-lg px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:border-line-strong w-64" />
          </div>
          {shown.length > 0 && (
            <div className="bg-ground border border-line rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-soft text-xs uppercase tracking-wider border-b border-line">
                    <th className="px-4 py-2.5 font-[550]">GitHub</th>
                    {detail.form.fields.map((f) => <th key={f.key} className="px-4 py-2.5 font-[550]">{f.label.replace(/\?$/, '')}</th>)}
                    {detail.form.addToRoster && <th className="px-4 py-2.5 font-[550]">Roster</th>}
                    <th className="px-4 py-2.5 font-[550]">Submitted</th>
                    <th className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.githubId} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <a href={`https://github.com/${r.github}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand-600 hover:underline">
                          {r.avatarUrl && <img src={r.avatarUrl} alt="" className="w-5 h-5 rounded-full" />}@{r.github}
                        </a>
                      </td>
                      {detail.form.fields.map((f) => (
                        <td key={f.key} className="px-4 py-2.5 text-ink-mid max-w-[18rem]">
                          {f.type === 'email' && r.answers[f.key] ? <a href={`mailto:${r.answers[f.key]}`} className="hover:underline">{r.answers[f.key]}</a> : (r.answers[f.key] ?? <span className="text-ink-faint">—</span>)}
                        </td>
                      ))}
                      {detail.form.addToRoster && (
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {r.onRoster
                            ? <span className="text-success-600 text-xs font-[550]">{r.rosterAddedAt ? 'added by form' : 'on roster'}</span>
                            : <span className="text-warning-600 text-xs font-[550]" title="Not on the roster now: add them from the Students tab">not on roster</span>}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap tabular-nums" title={r.updatedAt !== r.createdAt ? `updated ${when(r.updatedAt)}` : undefined}>{when(r.createdAt)}</td>
                      <td className="px-2 py-2.5 text-right"><button type="button" onClick={() => remove(r)} className="text-ink-faint hover:text-error-600 text-xs font-[550]" title="Remove this response">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
