import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getStudentsKV } from '@/lib/kv-students';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { getRepoCache, prExcludedBy } from '@/lib/repo-cache';
import { getOwnRepoExceptions, buildOwnRepoExceptionMap, EMPTY_REPO_SET } from '@/lib/kv-own-repo-exceptions';
import { readOrgIndex, rebuildOrgIndex, studentsMissingFromIndex, orgIndexRebuiltAt, indexedStudents } from '@/lib/org-index';
import { readSummaryCache } from '@/lib/summary-cache';
import { classifyUnknownOwners, getOrgCache, unclassifiedOwners } from '@/lib/org-cache';

export const dynamic = 'force-dynamic';

/** GET /api/admin/org-index — how complete the org search index is right now. */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [index, summaries, rebuiltAt] = await Promise.all([
    readOrgIndex(),
    readSummaryCache('all').then((c) => c?.summaries ?? []),
    orgIndexRebuiltAt(),
  ]);
  const missing = studentsMissingFromIndex(index, summaries);
  const unclassified = unclassifiedOwners(index, await getOrgCache());
  return NextResponse.json({
    organisations: Object.keys(index).length,
    ownersAwaitingClassification: unclassified.length,
    ownersAwaitingClassificationSample: unclassified.slice(0, 10),
    studentsIndexed: indexedStudents(index).size,
    studentsWithMergedPRs: summaries.filter((s) => s.mergedPRs > 0).length,
    missing,
    rebuiltAt: rebuiltAt?.toISOString() ?? null,
  });
}

/** POST /api/admin/org-index — rebuild the index from every profile cache now. */
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [students, flaggedPRIds, repoCache, ownRepoExceptionMap] = await Promise.all([
    getStudentsKV(),
    getFlaggedPRIdSet(),
    getRepoCache(),
    getOwnRepoExceptions().then(buildOwnRepoExceptionMap),
  ]);
  const index = await rebuildOrgIndex(students, (student) => {
    const own = ownRepoExceptionMap.get(student.github.toLowerCase()) ?? EMPTY_REPO_SET;
    return {
      flaggedPRIds,
      excludesPR: (repo, mergedAt) => !own.has(repo.toLowerCase()) && prExcludedBy(repoCache[repo], mergedAt) !== null,
    };
  });
  if (!index) return NextResponse.json({ error: 'The store did not accept the rebuilt index.' }, { status: 503 });
  // Then classify every owner the index knows, so the search box can suggest
  // all of them. ~700 owners is well inside one hour of the system token.
  const classified = await classifyUnknownOwners(2000);
  return NextResponse.json({ ok: true, organisations: Object.keys(index).length, studentsIndexed: indexedStudents(index).size, classified });
}
