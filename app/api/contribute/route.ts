import { getApprovedContributeItemsKV, addContributeItem, ContributeType } from '@/lib/kv-contribute';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** GET /api/contribute — public list of approved issues/repos */
export async function GET() {
  const items = await getApprovedContributeItemsKV();
  return Response.json(items);
}

/** POST /api/contribute — submit a new issue or repo (any logged-in user).
 * Always lands as 'pending' — admin-direct-add lives in /api/admin/contribute. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: 'You must be signed in with GitHub to submit.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, repoLink, description, siteLink, issueLink, screenshotUrl } = body as {
    type?: ContributeType;
    repoLink?: string;
    description?: string;
    siteLink?: string;
    issueLink?: string;
    screenshotUrl?: string;
  };

  if (type !== 'issue' && type !== 'repo') {
    return Response.json({ error: 'type must be "issue" or "repo"' }, { status: 400 });
  }
  if (!repoLink?.trim()) {
    return Response.json({ error: 'Repo link is required.' }, { status: 400 });
  }
  if (!description?.trim()) {
    return Response.json({ error: 'A short description is required.' }, { status: 400 });
  }

  const item = await addContributeItem({
    type,
    repoLink: repoLink.trim(),
    description: description.trim(),
    submittedBy: user.username,
    ...(type === 'issue' && {
      siteLink: siteLink?.trim() || undefined,
      issueLink: issueLink?.trim() || undefined,
      screenshotUrl: screenshotUrl?.trim() || undefined,
    }),
  });

  return Response.json({ ok: true, item });
}
