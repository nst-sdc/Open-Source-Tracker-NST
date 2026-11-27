'use client';

import { useEffect, useState } from 'react';
import type { ClosedPrSummary, Dont, Flag } from '@/lib/closed-pr-review';

/**
 * Closed PRs: why students' pull requests close without merging, from
 * what maintainers wrote. Scan fetches GitHub's comments for closed PRs
 * not yet stored; the summary can be narrowed by campus and year; any
 * flagged quote can be promoted, names removed, to the Don'ts shown on
 * /get-started.
 */
const CAMPUSES = ['Rishihood', 'ADYPU', 'SVYASA', 'SMRU'];
const YEARS = ['1st year', '2nd year', '3rd year', '4th year'];
const FLAG_LABEL: Record<Flag, string> = { ai: 'AI-generated', warning: 'ban / warning', process: 'process', ping: 'pinging', duplicate: 'duplicate / spam', 'low-quality': 'low quality', incomplete: 'incomplete', scope: 'out of scope', stale: 'stale' };
const n = (x: number) => x.toLocaleString('en-IN');
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '');
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl px-4 py-3 min-w-[9rem]">
      <div className="text-ink-soft text-xs">{label}</div>
      <div className="text-ink text-2xl font-[600] tabular-nums mt-0.5">{typeof value === 'number' ? n(value) : value}</div>
      {note && <div className="text-ink-soft text-xs mt-0.5">{note}</div>}
    </div>
  );
}

export default function ClosedPrsTab() {
  const [summary, setSummary] = useState<ClosedPrSummary | null>(null);
  const [donts, setDonts] = useState<Dont[]>([]);
  const [campus, setCampus] = useState('');
  const [year, setYear] = useState('');
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [scan, setScan] = useState<{ running: boolean; cursor: number; total: number; fetched: number; note: string } | null>(null);
  const [adding, setAdding] = useState<{ key: string; index: number; lesson: string; quote: string } | null>(null);
  const [flagFilter, setFlagFilter] = useState<Flag | ''>('');

  useEffect(() => {
    const q = new URLSearchParams(); if (campus) q.set('campus', campus); if (year) q.set('year', year);
    fetch(`/api/admin/closed-prs?${q}`).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSummary(data.summary); else setError(data.error ?? 'Could not load.');
    }).catch(() => setError('Could not load.'));
    fetch('/api/admin/donts').then(async (res) => { const d = await res.json().catch(() => ({})); if (res.ok) setDonts(d.donts ?? []); }).catch(() => {});
  }, [campus, year, reload]);

  async function runScan() {
    let cursor = 0; let fetched = 0; let total = 0;
    setScan({ running: true, cursor: 0, total: 0, fetched: 0, note: 'starting' });
    for (let i = 0; i < 400; i++) {
      const res = await fetch(`/api/admin/closed-prs?cursor=${cursor}&limit=40`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setScan({ running: false, cursor, total, fetched, note: d.error ?? 'scan failed' }); return; }
      cursor = d.nextCursor; total = d.total; fetched += d.fetched;
      setScan({ running: true, cursor, total, fetched, note: d.rateLimited ? 'GitHub rate limit reached; waiting a minute' : `student ${cursor} of ${total}` });
      if (d.done) break;
      if (d.rateLimited) await new Promise((r) => setTimeout(r, 65_000));
    }
    setScan({ running: false, cursor, total, fetched, note: 'done' });
    setReload((x) => x + 1);
  }

  async function addToDonts() {
    if (!adding) return;
    const res = await fetch('/api/admin/donts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adding) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? 'Could not add.'); return; }
    setDonts((x) => [...x, d.dont]); setAdding(null);
  }
  async function removeDont(id: string) {
    if (!confirm('Remove this quote from the public Don’ts?')) return;
    const res = await fetch(`/api/admin/donts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setDonts((x) => x.filter((d) => d.id !== id));
  }

  const s = summary;
  const flagged = (s?.flagged ?? []).filter((f) => !flagFilter || f.flags.includes(flagFilter));
  const sel = 'bg-ground border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink font-[600]">Closed PRs: what maintainers said</h2>
          <p className="text-ink-soft text-xs mt-0.5">
            Pull requests closed without merging in the last 12 months, with GitHub&apos;s comments, reviews, labels and who closed them.
            {s?.lastScanAt && ` Last scan ${new Date(s.lastScanAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={campus} onChange={(e) => setCampus(e.target.value)} className={sel}><option value="">All campuses</option>{CAMPUSES.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={year} onChange={(e) => setYear(e.target.value)} className={sel}><option value="">All years</option>{YEARS.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="button" onClick={runScan} disabled={scan?.running} className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-50 text-white text-sm font-[550]">{scan?.running ? 'Scanning…' : 'Scan new closed PRs'}</button>
        </div>
      </div>
      {scan && <p className="text-ink-soft text-xs">Scan: {n(scan.fetched)} PRs fetched · {scan.note}</p>}
      {error && <div className="bg-error-0 border border-error-100 rounded-xl p-3 text-error-600 text-sm flex justify-between"><span>{error}</span><button type="button" onClick={() => setError('')} className="text-xs underline">dismiss</button></div>}

      {s && s.total === 0 && <p className="text-ink-soft text-sm">Nothing scanned yet{campus || year ? ' for this filter' : ''}. Press “Scan new closed PRs”; the first run fetches every closed PR of the last year (a few thousand GitHub calls, resumable).</p>}

      {s && s.total > 0 && (
        <>
          <div className="flex flex-wrap gap-3">
            <Tile label="Closed without merge" value={s.total} note={`${n(s.closedBy.author)} withdrawn by the student · ${n(s.closedBy.bot)} by a bot`} />
            <Tile label="Called AI-generated" value={s.byMonth.reduce((a, m) => a + m.ai, 0)} note={`by a human maintainer · ${pct(s.byMonth.reduce((a, m) => a + m.ai, 0), s.total)}`} />
            <Tile label="Ban or final warning" value={s.byMonth.reduce((a, m) => a + m.warnings, 0)} note="explicit, in a maintainer's words" />
            <Tile label="Students involved" value={s.students.length >= 60 ? '60+' : s.students.length} note="shown below, most serious first" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-ground border border-line rounded-xl p-4">
              <h3 className="text-ink text-sm font-[600] mb-2">Why they closed</h3>
              <ul className="space-y-1.5 text-sm">
                {s.reasons.map((r) => (
                  <li key={r.reason} className="flex items-center gap-2">
                    <span className="w-28 text-right tabular-nums text-ink-soft text-xs">{n(r.count)} · {pct(r.count, s.total)}</span>
                    <span className="flex-1 h-2 rounded-full bg-panel overflow-hidden"><span className="block h-full bg-brand-500" style={{ width: pct(r.count, s.total) }} /></span>
                    <span className="w-64 text-ink-mid text-xs">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-ground border border-line rounded-xl p-4">
              <h3 className="text-ink text-sm font-[600] mb-2">By campus and year</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-ink-soft text-left"><th className="py-1 font-[550]">Campus</th><th className="py-1 font-[550] text-right">closed</th><th className="py-1 font-[550] text-right">AI-flagged</th><th className="py-1 font-[550] text-right">warnings</th><th className="py-1 font-[550]">most common reason</th></tr></thead>
                <tbody>{s.byCampus.map((c) => <tr key={c.campus} className="border-t border-line"><td className="py-1 text-ink">{c.campus}</td><td className="py-1 text-right tabular-nums">{n(c.count)}</td><td className="py-1 text-right tabular-nums">{n(c.ai)}</td><td className="py-1 text-right tabular-nums">{n(c.warnings)}</td><td className="py-1 text-ink-mid">{c.top}</td></tr>)}</tbody>
              </table>
              <table className="w-full text-xs mt-3">
                <thead><tr className="text-ink-soft text-left"><th className="py-1 font-[550]">Year</th><th className="py-1 font-[550] text-right">closed</th><th className="py-1 font-[550] text-right">AI-flagged</th><th className="py-1 font-[550] text-right">warnings</th></tr></thead>
                <tbody>{s.byYear.map((c) => <tr key={c.year} className="border-t border-line"><td className="py-1 text-ink">{c.year}</td><td className="py-1 text-right tabular-nums">{n(c.count)}</td><td className="py-1 text-right tabular-nums">{n(c.ai)}</td><td className="py-1 text-right tabular-nums">{n(c.warnings)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-ground border border-line rounded-xl p-4">
              <h3 className="text-ink text-sm font-[600] mb-2">By month opened</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-ink-soft text-left"><th className="py-1 font-[550]">Month</th><th className="py-1 font-[550] text-right">closed</th><th className="py-1 font-[550] text-right">AI-flagged</th><th className="py-1 font-[550] text-right">warnings</th></tr></thead>
                <tbody>{s.byMonth.map((m) => <tr key={m.month} className="border-t border-line"><td className="py-1 text-ink">{monthLabel(m.month)}</td><td className="py-1 text-right tabular-nums">{n(m.closed)}</td><td className="py-1 text-right tabular-nums">{n(m.ai)}</td><td className="py-1 text-right tabular-nums">{n(m.warnings)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="bg-ground border border-line rounded-xl p-4">
              <h3 className="text-ink text-sm font-[600] mb-2">Organisations closing the most</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-ink-soft text-left"><th className="py-1 font-[550]">Organisation</th><th className="py-1 font-[550] text-right">closed</th><th className="py-1 font-[550]">most common reason</th></tr></thead>
                <tbody>{s.byOwner.slice(0, 15).map((o) => <tr key={o.owner} className="border-t border-line"><td className="py-1 text-ink">{o.owner}</td><td className="py-1 text-right tabular-nums">{n(o.count)}</td><td className="py-1 text-ink-mid">{o.top}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div className="bg-ground border border-line rounded-xl p-4">
            <h3 className="text-ink text-sm font-[600] mb-2">Students to talk to</h3>
            <p className="text-ink-soft text-xs mb-2">Ranked by warnings, then AI accusations, then closed PRs. Links go to the PRs that drew the comments.</p>
            <table className="w-full text-xs">
              <thead><tr className="text-ink-soft text-left"><th className="py-1 font-[550]">Student</th><th className="py-1 font-[550]">Campus · year</th><th className="py-1 font-[550] text-right">closed</th><th className="py-1 font-[550] text-right">AI-flagged</th><th className="py-1 font-[550] text-right">warnings</th><th className="py-1 font-[550]">PRs</th></tr></thead>
              <tbody>
                {s.students.slice(0, 40).map((st) => (
                  <tr key={st.login} className="border-t border-line align-top">
                    <td className="py-1"><a href={`/contributors/${st.login}`} className="text-brand-600 hover:underline">@{st.login}</a></td>
                    <td className="py-1 text-ink-mid">{[st.campus, st.year].filter(Boolean).join(' · ')}</td>
                    <td className="py-1 text-right tabular-nums">{n(st.closed)}</td>
                    <td className={`py-1 text-right tabular-nums ${st.ai ? 'text-error-600 font-[600]' : ''}`}>{n(st.ai)}</td>
                    <td className={`py-1 text-right tabular-nums ${st.warnings ? 'text-error-600 font-[600]' : ''}`}>{n(st.warnings)}</td>
                    <td className="py-1 text-ink-soft">{st.keys.slice(0, 4).map((k) => <a key={k} href={`https://github.com/${k.replace('#', '/pull/')}`} target="_blank" rel="noreferrer" className="mr-2 hover:underline">{k}</a>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-ground border border-line rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-ink text-sm font-[600]">What maintainers wrote</h3>
              <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value as Flag | '')} className={sel}><option value="">All kinds</option>{(Object.keys(FLAG_LABEL) as Flag[]).map((f) => <option key={f} value={f}>{FLAG_LABEL[f]}</option>)}</select>
            </div>
            <ul className="space-y-2">
              {flagged.slice(0, 60).map((f) => (
                <li key={f.key} className="border border-line rounded-lg p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft mb-1">
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{f.key}</a>
                    <span>· @{f.login}</span>
                    {f.flags.map((fl) => <span key={fl} className="rounded-full border border-line px-2 py-0.5">{FLAG_LABEL[fl]}</span>)}
                    <button type="button" onClick={() => setAdding({ key: f.key, index: 0, lesson: '', quote: f.quote.body })} className="ml-auto text-brand-600 hover:underline">Add to Don’ts</button>
                  </div>
                  <p className="text-ink-mid leading-relaxed">{f.quote.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {adding && (
        <div className="bg-ground border border-line-strong rounded-xl p-4 space-y-3">
          <h3 className="text-ink text-sm font-[600]">Add to the public Don’ts</h3>
          <p className="text-ink-soft text-xs">Names, mentions and profile links are removed automatically. Trim the quote if you like, and say which rule it illustrates.</p>
          <textarea rows={4} value={adding.quote} onChange={(e) => setAdding({ ...adding, quote: e.target.value })} className="w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink" />
          <input value={adding.lesson} onChange={(e) => setAdding({ ...adding, lesson: e.target.value })} placeholder="Lesson, e.g. Do not submit code you cannot explain" className="w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink" />
          <div className="flex gap-2">
            <button type="button" onClick={addToDonts} className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[550]">Add</button>
            <button type="button" onClick={() => setAdding(null)} className="px-3 py-1.5 rounded-lg border border-line text-ink-mid text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-ground border border-line rounded-xl p-4">
        <h3 className="text-ink text-sm font-[600] mb-1">Public Don’ts on /get-started</h3>
        <p className="text-ink-soft text-xs mb-2">{donts.length} quote{donts.length === 1 ? '' : 's'} shown to students, names removed.</p>
        <ul className="space-y-2">
          {donts.map((d) => (
            <li key={d.id} className="border border-line rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-ink-soft mb-1"><span className="font-[550] text-ink">{d.lesson}</span><span>· {d.repo}{d.when ? ` · ${d.when}` : ''}</span><button type="button" onClick={() => removeDont(d.id)} className="ml-auto text-ink-faint hover:text-error-600">Remove</button></div>
              <p className="text-ink-mid leading-relaxed whitespace-pre-line">{d.quote}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
