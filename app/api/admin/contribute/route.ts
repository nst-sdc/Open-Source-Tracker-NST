import { checkAdminAuth } from '@/lib/admin-auth';
import {
  getAllContributeItemsKV,
  addContributeItem,
  updateContributeItemStatus,
  ContributeType,
} from '@/lib/kv-contribute';

/** GET /api/admin/contribute — list every submission regardless of status */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const items = await getAllContributeItemsKV();
  return Response.json(items);
}

/** POST /api/admin/contribute — approve/reject a pending submission, or add
 * an issue/repo directly as already-approved (NST SDC team curation, skips
 * the queue entirely). */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: 'approve' | 'reject' | 'create' };

  if (action === 'approve' || action === 'reject') {
    const { id } = body as { id?: string };
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    const result = await updateContributeItemStatus(id, action === 'approve' ? 'approved' : 'rejected');
    if (!result.ok) return Response.json({ error: 'Item not found' }, { status: 404 });
    return Response.json({ ok: true });
  }

  if (action === 'create') {
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
    if (!repoLink?.trim() || !description?.trim()) {
      return Response.json({ error: 'Repo link and description are required.' }, { status: 400 });
    }

    const item = await addContributeItem({
      type,
      repoLink: repoLink.trim(),
      description: description.trim(),
      submittedBy: 'NST SDC Team',
      status: 'approved',
      ...(type === 'issue' && {
        siteLink: siteLink?.trim() || undefined,
        issueLink: issueLink?.trim() || undefined,
        screenshotUrl: screenshotUrl?.trim() || undefined,
      }),
    });
    return Response.json({ ok: true, item });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
