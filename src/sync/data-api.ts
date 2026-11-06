import { AuthError, getJwt } from '@/auth/neon-auth';
import type { TableName } from '@/db/types';

/** Neon Data API (PostgREST). Every request carries the user's JWT; Postgres RLS scopes it. */
export const DATA_API_URL = (process.env.EXPO_PUBLIC_NEON_DATA_API_URL ?? '').replace(/\/$/, '');

async function request(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  if (!DATA_API_URL) throw new Error('EXPO_PUBLIC_NEON_DATA_API_URL is not set (see .env.example)');
  const token = await getJwt(retried);
  const res = await fetch(`${DATA_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && !retried) return request(path, init, true);
  if (res.status === 401) throw new AuthError('Session expired. Please sign in again.', 401);
  if (!res.ok) throw new DataApiError(`Data API ${res.status} on ${path}: ${await res.text()}`, res.status);
  return res;
}

export class DataApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/**
 * The server refused these particular rows (a CHECK constraint, a bad value), so another row could
 * still go through. Not for a missing table or column (PGRST204/205): those fail every row alike.
 */
export const isRowRejection = (e: unknown) =>
  e instanceof DataApiError && e.status >= 400 && e.status < 500 && e.status !== 404 && !/PGRST20[45]/.test(e.message);

/**
 * Upsert rows by (user_id, id). The server fills user_id from the JWT and its trigger
 * ignores rows older than what it already has (last write wins).
 */
export async function upsertRows(table: TableName, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  await request(`/${table}?on_conflict=user_id,id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
}

/**
 * Rows with rev above `cursor`, plus rows the server wrote after `recentSince` (an ISO time): those
 * may have committed after a higher rev was already seen. Paged by rev: pass the last page's highest
 * rev as `afterRev`. Oldest first.
 */
export async function rowsSince(
  table: TableName,
  cursor: number,
  recentSince: string | null,
  afterRev: number,
  limit: number
): Promise<Record<string, unknown>[]> {
  const filter = recentSince
    ? `rev=gt.${afterRev}&or=${encodeURIComponent(`(rev.gt.${cursor},server_updated_at.gt."${recentSince}")`)}`
    : `rev=gt.${Math.max(0, cursor, afterRev)}`;
  const res = await request(`/${table}?${filter}&order=rev.asc&limit=${limit}`);
  return (await res.json()) as Record<string, unknown>[];
}
