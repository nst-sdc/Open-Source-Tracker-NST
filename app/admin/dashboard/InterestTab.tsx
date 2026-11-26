'use client';

import { useEffect, useState } from 'react';
import { channelLabel, type InterestRegistration } from '@/lib/interest-form';
import type { InterestUsage } from '@/lib/usage';

const GO_LABELS: Record<string, string> = {
  'go:leaderboard': 'Leaderboard', 'go:profile': 'Their profile', 'go:gsoc': 'GSoC', 'go:lfx': 'LFX Mentorship',
  'go:sob': 'Summer of Bitcoin', 'go:esoc': 'European Summer of Code', 'go:outreachy': 'Outreachy', 'go:more': 'All programmes', 'go:join': 'Join the tracker',
};

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl px-4 py-3 min-w-[9rem]">
      <div className="text-ink-soft text-xs">{label}</div>
      <div className="text-ink text-2xl font-[600] tabular-nums mt-0.5">{value.toLocaleString('en-IN')}</div>
      {note && <div className="text-ink-soft text-xs mt-0.5">{note}</div>}
    </div>
  );
}

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '');

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Who has filled the open-source interest form, with a CSV download. */
export default function InterestTab() {
  const [rows, setRows] = useState<Array<InterestRegistration & { onRoster?: boolean }> | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [usage, setUsage] = useState<InterestUsage | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    fetch(`/api/admin/interest?days=${days}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) { setRows(data.registrations ?? []); setUsage(data.usage ?? null); }
        else setError(data.error ?? 'Could not load registrations.');
      })
      .catch(() => setError('Could not load registrations.'));
  }, [days]);

  async function remove(r: InterestRegistration) {
    if (!confirm(`Remove ${r.name} (@${r.github}) from the interest form? Their roster entry is not touched.`)) return;
    const res = await fetch(`/api/admin/interest?githubId=${r.githubId}`, { method: 'DELETE' });
    if (res.ok) setRows((rows) => (rows ?? []).filter((x) => x.githubId !== r.githubId));
    else setError('Could not remove the registration.');
  }

  const t = usage?.totals;
  const went = t ? Object.entries(GO_LABELS).map(([k, label]) => ({ label, n: t[k as keyof typeof t] ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n) : [];

  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !needle || [r.name, r.email, r.github, r.batch, r.campus, r.channel ? channelLabel(r.channel) : ''].some((v) => v.toLowerCase().includes(needle)));
  const byCampus = (rows ?? []).reduce<Record<string, number>>((m, r) => ((m[r.campus] = (m[r.campus] ?? 0) + 1), m), {});
  const byChannel = (rows ?? []).reduce<Record<string, number>>((m, r) => { const k = r.channel ? channelLabel(r.channel) : 'not asked'; m[k] = (m[k] ?? 0) + 1; return m; }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-ink font-[600]">Open-source interest form</h2>
          <p className="text-ink-soft text-xs mt-0.5">
            {rows ? `${rows.length} registered` : 'Loading…'}
            {rows && rows.length > 0 && ` · ${Object.entries(byCampus).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ')}`}
            {rows && rows.length > 0 && ` · ${rows.filter((r) => r.onRoster).length} on the roster`}
            {rows && rows.length > 0 && ` · reads messages on: ${Object.entries(byChannel).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}`}
            {' · '}shareable link: <span className="font-mono">/interest</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, email, GitHub, campus" className="bg-ground border border-line rounded-lg px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:border-line-strong w-64" />
          <a href="/api/admin/interest?format=csv" className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[550] transition-all">Download CSV</a>
        </div>
      </div>

      {error && <div className="bg-error-0 border border-error-100 rounded-xl p-3 text-error-600 text-sm">{error}</div>}

      {/* Funnel: opened → clicked sign in → saw the form → registered; then where they went */}
      <div className="bg-ground border border-line rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-ink text-sm font-[600]">How the form is doing</h3>
          <div className="flex items-center gap-1 rounded-full border border-line bg-panel p-0.5" role="tablist" aria-label="Range">
            {([7, 30, 90] as const).map((d) => (
              <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-full text-[11.5px] font-[550] transition-colors ${days === d ? 'bg-ground text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
                {d} days
              </button>
            ))}
          </div>
        </div>
        {!t ? (
          <p className="text-ink-soft text-xs">No usage counts yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <Tile label="Opened the form" value={usage!.openers} note={`${t.open.toLocaleString('en-IN')} views`} />
              <Tile label="Clicked sign in" value={t.signin} note={pct(t.signin, usage!.openers) && `${pct(t.signin, usage!.openers)} of openers`} />
              <Tile label="Saw the form signed in" value={t.form} note={`${t.done.toLocaleString('en-IN')} returned already registered`} />
              <Tile label="Registered" value={t.registered} note={`${t.updated.toLocaleString('en-IN')} updated their details`} />
            </div>
            <div>
              <div className="text-ink-soft text-xs mb-1.5">Where they went next</div>
              {went.length === 0 ? (
                <p className="text-ink-soft text-xs">No clicks yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {went.map((w) => (
                    <span key={w.label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-mid">
                      {w.label} <span className="tabular-nums font-[600] text-ink">{w.n.toLocaleString('en-IN')}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {rows && rows.length === 0 && <p className="text-ink-soft text-sm">No registrations yet.</p>}

      {shown.length > 0 && (
        <div className="bg-ground border border-line rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft text-xs uppercase tracking-wider border-b border-line">
                <th className="px-4 py-2.5 font-[550]">Name</th>
                <th className="px-4 py-2.5 font-[550]">Email</th>
                <th className="px-4 py-2.5 font-[550]">GitHub</th>
                <th className="px-4 py-2.5 font-[550]">Batch</th>
                <th className="px-4 py-2.5 font-[550]">Campus</th>
                <th className="px-4 py-2.5 font-[550]">Reads on</th>
                <th className="px-4 py-2.5 font-[550]">Roster</th>
                <th className="px-4 py-2.5 font-[550]">Registered</th>
                <th className="px-4 py-2.5 font-[550]"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.githubId} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink whitespace-nowrap">{r.name}</td>
                  <td className="px-4 py-2.5 text-ink-mid"><a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <a href={`https://github.com/${r.github}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand-600 hover:underline">
                      {r.avatarUrl && <img src={r.avatarUrl} alt="" className="w-5 h-5 rounded-full" />}
                      @{r.github}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-ink-mid whitespace-nowrap">{r.batch}</td>
                  <td className="px-4 py-2.5 text-ink-mid">{r.campus}</td>
                  <td className="px-4 py-2.5 text-ink-mid whitespace-nowrap">{r.channel ? channelLabel(r.channel) : <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.onRoster
                      ? <span className="text-success-600 text-xs font-[550]">{r.rosterAddedAt ? 'added by form' : 'on roster'}</span>
                      : <span className="text-warning-600 text-xs font-[550]" title="The roster was unavailable when they registered; add them from the Students tab">not on roster</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap tabular-nums" title={r.updatedAt !== r.createdAt ? `updated ${when(r.updatedAt)}` : undefined}>{when(r.createdAt)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <button type="button" onClick={() => remove(r)} className="text-ink-faint hover:text-error-600 text-xs font-[550]" title="Remove this registration">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
