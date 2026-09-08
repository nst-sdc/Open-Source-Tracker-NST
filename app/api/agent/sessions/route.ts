/**
 * /api/agent/sessions — the student's own chat list.
 *
 * GET  → their chats, newest first (id, title, updatedAt).
 * GET  ?id=<uuid> → one chat's transcript, for reopening it.
 * DELETE ?id=<uuid> → forget one chat.
 *
 * Every operation is scoped to the caller's verified GitHub id. There is no
 * "which user" parameter anywhere in this file, by design: lib/agent-memory.ts
 * namespaces its KV keys under that id, so a request can only ever address
 * the requester's own data. This is the same principle that fixed the
 * impersonation bug in lib/session.ts — identity comes from GitHub, never
 * from anything the client can set.
 */
import { deleteSession, isValidSessionId, listSessions, loadSession } from '@/lib/agent-memory';
import { getViewer } from '@/lib/session';
import { isSameOrigin } from '@/lib/same-origin';
import { isAssistantDisabled } from '@/lib/assistant';

export const dynamic = 'force-dynamic';

function fail(code: string, error: string, status: number): Response {
  return Response.json({ code, error }, { status });
}

/** Shared gate: same-origin, then a verified session. */
async function gate(request: Request) {
  if (isAssistantDisabled()) {
    return { error: fail('assistant_disabled', 'The assistant is temporarily unavailable.', 503) };
  }
  if (!isSameOrigin(request)) {
    return { error: fail('bad_origin', 'This request did not come from the tracker.', 403) };
  }
  const session = await getViewer(request);
  if (session.status === 'unavailable') {
    return {
      error: fail('auth_unavailable', 'We could not reach GitHub to check your sign-in. Try again in a moment.', 503),
    };
  }
  if (session.status === 'anonymous') {
    return { error: fail('auth_required', 'Sign in with GitHub to see your chats.', 401) };
  }
  if (session.status === 'invalid') {
    return { error: fail('auth_expired', 'Your GitHub sign-in expired. Sign in again to continue.', 401) };
  }
  return { viewer: session.viewer };
}

export async function GET(request: Request) {
  const gated = await gate(request);
  if (gated.error) return gated.error;
  const { viewer } = gated;

  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    if (!isValidSessionId(id)) return fail('bad_request', 'Invalid chat id.', 400);
    const found = await loadSession(viewer.id, id);
    // Null covers both "expired" and "belongs to somebody else"; the client
    // must not be able to tell those apart.
    if (!found) return fail('not_found', 'That chat is no longer available.', 404);
    return Response.json({
      id: found.id,
      title: found.title,
      updatedAt: found.updatedAt,
      repo: found.repo ?? null,
      messages: found.messages.map((m) => ({ role: m.role, content: m.content })),
    });
  }

  return Response.json({ sessions: await listSessions(viewer.id) });
}

export async function DELETE(request: Request) {
  const gated = await gate(request);
  if (gated.error) return gated.error;
  const { viewer } = gated;

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !isValidSessionId(id)) return fail('bad_request', 'Invalid chat id.', 400);
  await deleteSession(viewer.id, id);
  // Idempotent: deleting a chat that is already gone is a success, not a 404.
  return Response.json({ ok: true });
}
