import Link from 'next/link';
import { Suspense } from 'react';
import { readOrgIndex } from '@/lib/org-index';
import { getOrgCache } from '@/lib/org-cache';
import { getVouchedOrgs } from '@/lib/kv-vouched-orgs';
import { getStudentsKV } from '@/lib/kv-students';
import { getRepoCache } from '@/lib/repo-cache';
import { buildOrgExplorer } from '@/lib/org-explorer';
import { OrgExplorer } from './OrgExplorer';

export const metadata = { title: 'Organizations — Opensource Tracker NST' };
// Rendered on request, like the home and contributors pages. The page was
// prerendered at build time, when the store is out of reach, with every count
// at zero, and the deployment never regenerated it: the live page showed no
// NST contributor anywhere for hours after the index was rebuilt.
export const dynamic = 'force-dynamic';

/**
 * Every organisation our students have merged into, and every one on a
 * programme list, as cards: pick a programme to see its organisations and
 * how many of us contribute to each; open a card for the contributors.
 */
export default async function OrganizationsPage() {
  const [index, orgCache, vouched, students, repoCache] = await Promise.all([readOrgIndex(), getOrgCache(), getVouchedOrgs(), getStudentsKV(), getRepoCache()]);
  const data = buildOrgExplorer({
    index,
    orgCache,
    repoCache,
    vouched: vouched.map((v) => v.login),
    roster: new Set(students.map((s) => s.github.toLowerCase())),
  });

  return (
    <main className="min-h-screen bg-panel">
      <div className="relative overflow-hidden pt-14 pb-8 px-4">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-[500px] h-[350px] rounded-full bg-brand-100/40 blur-[100px]" />
          <div className="absolute top-0 right-1/4 w-[400px] h-[300px] rounded-full bg-violet-600/7 blur-[100px]" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-ink-soft hover:text-ink-mid transition-colors text-sm mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
            Home
          </Link>
          <h1 className="text-3xl md:text-4xl font-[700] text-ink tracking-tight">Organizations</h1>
          <p className="text-ink-soft mt-3 max-w-2xl text-[15px] leading-relaxed">
            Every organisation in GSoC, LFX, CNCF, Outreachy and the other programmes, with what it builds, the years it mentored, and who from NST is already there. Pick what you know under “I know…”, choose a year, and open any card for its history, links and good first issues.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="max-w-7xl mx-auto px-4 md:px-6 pb-20 text-sm text-ink-soft">Loading organisations…</div>}>
        <OrgExplorer data={data} />
      </Suspense>
    </main>
  );
}
