import { kvGet, kvSet } from './kv';

const KV_KEY = 'join_requests';

export interface JoinRequest {
  github: string;
  name?: string;
  avatarUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  year?: '1st year' | '2nd year' | '3rd year' | '4th year';
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA' | 'SMRU';
}

export async function getJoinRequestsKV(): Promise<JoinRequest[]> {
  const cached = await kvGet<JoinRequest[]>(KV_KEY);
  return cached || [];
}

export async function addJoinRequest(
  github: string,
  name?: string,
  avatarUrl?: string,
  year?: '1st year' | '2nd year' | '3rd year' | '4th year',
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA' | 'SMRU'
): Promise<{ ok: boolean; message?: string }> {
  const list = await getJoinRequestsKV();
  const lower = github.toLowerCase().trim();
  if (!lower) return { ok: false, message: 'GitHub username cannot be empty' };

  if (list.some((s) => s.github.toLowerCase() === lower && s.status === 'pending')) {
    return { ok: false, message: 'You already have a pending request.' };
  }

  list.push({
    github: github.trim(),
    name: name?.trim() || undefined,
    avatarUrl: avatarUrl || undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
    year,
    campus,
  });

  await kvSet(KV_KEY, list);
  return { ok: true };
}

export async function updateJoinRequestStatus(
  github: string,
  status: 'approved' | 'rejected'
): Promise<{ ok: boolean }> {
  const list = await getJoinRequestsKV();
  const lower = github.toLowerCase().trim();
  const index = list.findIndex((s) => s.github.toLowerCase() === lower && s.status === 'pending');
  if (index === -1) return { ok: false };

  list[index].status = status;
  await kvSet(KV_KEY, list);
  return { ok: true };
}
