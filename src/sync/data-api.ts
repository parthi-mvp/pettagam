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
  if (!res.ok) throw new Error(`Data API ${res.status} on ${path}: ${await res.text()}`);
  return res;
}

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

/** Rows changed after `sinceRev`, oldest first. */
export async function rowsSince(table: TableName, sinceRev: number, limit: number): Promise<Record<string, unknown>[]> {
  const res = await request(`/${table}?rev=gt.${Math.max(0, sinceRev)}&order=rev.asc&limit=${limit}`);
  return (await res.json()) as Record<string, unknown>[];
}
