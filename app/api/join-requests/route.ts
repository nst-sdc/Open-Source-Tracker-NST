import { getStudentProfile } from '@/lib/github';
import { getStudentsKV } from '@/lib/kv-students';
import { addJoinRequest, getJoinRequestsKV } from '@/lib/kv-join-requests';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';

export async function GET(request: Request) {
  // Eligibility checks hit the GitHub API per call — brake scanners before
  // they can burn the shared Search quota (LLM10 / issue #45).
  const limited = await checkRateLimit(`rl:join-check:${getClientIp(request)}`, 30, 60);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);

  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username')?.trim();

    if (!username) {
      return Response.json({ error: 'Username parameter is required.' }, { status: 400 });
    }

    // 1. Check if already tracked on the leaderboard
    const students = await getStudentsKV();
    const isTracked = students.some((s) => s.github.toLowerCase() === username.toLowerCase());
    if (isTracked) {
      return Response.json({
        status: 'tracked',
        message: `@${username} is already on the leaderboard!`,
      });
    }

    // 2. Check if join request is pending
    const requests = await getJoinRequestsKV();
    const pendingRequest = requests.find(
      (r) => r.github.toLowerCase() === username.toLowerCase() && r.status === 'pending'
    );
    if (pendingRequest) {
      return Response.json({
        status: 'pending',
        message: `@${username} already has a pending join request.`,
      });
    }

    // 3. Fetch GitHub Profile to check if user exists
    const profile = await getStudentProfile(username);
    if (!profile) {
      return Response.json({
        status: 'not_found',
        message: `GitHub username @${username} not found.`,
      });
    }

    return Response.json({
      status: 'eligible',
      profile: {
        login: profile.login,
        name: profile.name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
      },
    });
  } catch (error) {
    console.error('Error checking join request status:', error);
    return Response.json({
      status: 'error',
      message: 'Failed to verify status. GitHub API rate limit exceeded or network error.',
    });
  }
}

export async function POST(request: Request) {
  // Queue writes are the spam vector — tight limit, legitimate users submit once.
  const limited = await checkRateLimit(`rl:join-submit:${getClientIp(request)}`, 5, 60);
  if (!limited.allowed) {
    return rateLimitedResponse(limited.retryAfter, 'Too many join requests. Please try again later.');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { github, year, campus } = body as {
      github?: string;
      year?: '1st year' | '2nd year' | '3rd year' | '4th year';
      campus?: 'Rishihood' | 'ADYPU' | 'SVYASA';
    };

    if (!github?.trim()) {
      return Response.json({ error: 'GitHub username is required.' }, { status: 400 });
    }

    const username = github.trim();

    // 1. Check if already tracked
    const students = await getStudentsKV();
    if (students.some((s) => s.github.toLowerCase() === username.toLowerCase())) {
      return Response.json(
        { error: `@${username} is already on the leaderboard!` },
        { status: 400 }
      );
    }

    // 2. Fetch/validate GitHub profile
    const profile = await getStudentProfile(username);
    if (!profile) {
      return Response.json(
        { error: `GitHub username @${username} not found. Make sure it is spelled correctly.` },
        { status: 400 }
      );
    }

    // 3. Add to requests queue (KV)
    const result = await addJoinRequest(
      profile.login,
      profile.name ?? profile.login,
      profile.avatar_url,
      year,
      campus
    );

    if (!result.ok) {
      return Response.json({ error: result.message }, { status: 400 });
    }

    return Response.json({ ok: true, message: 'Request submitted successfully!' });
  } catch (error) {
    console.error('Error submitting join request:', error);
    return Response.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
