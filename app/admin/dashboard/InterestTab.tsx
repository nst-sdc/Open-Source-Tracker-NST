'use client';

import { useEffect, useState } from 'react';
import type { InterestRegistration } from '@/lib/interest-form';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Who has filled the open-source interest form, with a CSV download. */
export default function InterestTab() {
  const [rows, setRows] = useState<Array<InterestRegistration & { onRoster?: boolean }> | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/admin/interest')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) setRows(data.registrations ?? []);
        else setError(data.error ?? 'Could not load registrations.');
      })
      .catch(() => setError('Could not load registrations.'));
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !needle || [r.name, r.email, r.github, r.batch, r.campus].some((v) => v.toLowerCase().includes(needle)));
  const byCampus = (rows ?? []).reduce<Record<string, number>>((m, r) => ((m[r.campus] = (m[r.campus] ?? 0) + 1), m), {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-ink font-[600]">Open-source interest form</h2>
          <p className="text-ink-soft text-xs mt-0.5">
            {rows ? `${rows.length} registered` : 'Loading…'}
            {rows && rows.length > 0 && ` · ${Object.entries(byCampus).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ')}`}
            {rows && rows.length > 0 && ` · ${rows.filter((r) => r.onRoster).length} on the roster`}
            {' · '}shareable link: <span className="font-mono">/interest</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, email, GitHub, campus" className="bg-ground border border-line rounded-lg px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:border-line-strong w-64" />
          <a href="/api/admin/interest?format=csv" className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[550] transition-all">Download CSV</a>
        </div>
      </div>

      {error && <div className="bg-error-0 border border-error-100 rounded-xl p-3 text-error-600 text-sm">{error}</div>}

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
                <th className="px-4 py-2.5 font-[550]">Roster</th>
                <th className="px-4 py-2.5 font-[550]">Registered</th>
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
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.onRoster
                      ? <span className="text-success-600 text-xs font-[550]">{r.rosterAddedAt ? 'added by form' : 'on roster'}</span>
                      : <span className="text-warning-600 text-xs font-[550]" title="The roster was unavailable when they registered; add them from the Students tab">not on roster</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap tabular-nums" title={r.updatedAt !== r.createdAt ? `updated ${when(r.updatedAt)}` : undefined}>{when(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
