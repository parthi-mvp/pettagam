// Pure helpers for talking to Neon (no imports → unit-tested in Node, see tests/wire.test.ts).

/** Columns that exist only on the server; stripped before writing to the phone cache. */
export const SERVER_ONLY_COLUMNS = ['user_id', 'rev', 'server_updated_at'] as const;

export type WireRow = { id: string; updated_at: number; [k: string]: unknown };

/** Phone row → Data API body. `details` is TEXT on the phone and JSONB on the server. */
export function toServer(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const c of SERVER_ONLY_COLUMNS) delete out[c];
  if (typeof out.details === 'string') {
    try {
      out.details = JSON.parse(out.details);
    } catch {
      out.details = null;
    }
  }
  return out;
}

/** Data API row → phone row. */
export function fromServer(row: Record<string, unknown>): WireRow {
  const out: Record<string, unknown> = { ...row };
  for (const c of SERVER_ONLY_COLUMNS) delete out[c];
  if (out.details != null && typeof out.details !== 'string') out.details = JSON.stringify(out.details);
  for (const k of Object.keys(out)) {
    // PostgREST may send numeric/bigint as strings depending on settings; the cache stores numbers.
    if (typeof out[k] === 'string' && NUMERIC_COLUMNS.has(k)) out[k] = Number(out[k]);
  }
  return out as WireRow;
}

const NUMERIC_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'deleted',
  'opening_balance',
  'credit_limit',
  'billing_day',
  'amount',
  'date',
  'invested_amount',
  'current_value',
  'quantity',
  'interest_rate',
  'start_date',
  'maturity_date',
  'units',
]);

/**
 * Should a pulled server row overwrite the phone's copy?
 * Server is the source of truth, except when this phone holds a newer, not-yet-uploaded edit.
 */
export function shouldApplyRemote(remoteUpdatedAt: number, local: { updated_at: number } | null, pendingUpload: boolean) {
  if (!local) return true;
  if (pendingUpload) return remoteUpdatedAt > local.updated_at;
  return remoteUpdatedAt >= local.updated_at;
}

/**
 * Upload rows in one request. If the server rejects the batch, retry row by row so one bad row
 * can't hold back the rest. Returns the ids still rejected, with the server's reason.
 * Any other error (offline, auth, missing table) is thrown as is.
 */
export async function uploadRows(
  rows: Record<string, unknown>[],
  upload: (rows: Record<string, unknown>[]) => Promise<void>,
  isRejection: (e: unknown) => boolean
): Promise<Map<string, string>> {
  const failed = new Map<string, string>();
  if (rows.length === 0) return failed;
  try {
    await upload(rows);
    return failed;
  } catch (e) {
    if (!isRejection(e)) throw e;
  }
  for (const row of rows) {
    try {
      await upload([row]);
    } catch (e) {
      if (!isRejection(e)) throw e;
      failed.set(String(row.id), e instanceof Error ? e.message : String(e));
    }
  }
  return failed;
}

/** Split a (possibly comma-joined) Set-Cookie header into "name=value" pairs. */
export function parseSetCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  // Commas also appear inside "Expires=Wed, 21 Oct ..." so only split before "name=".
  for (const part of header.split(/,(?=\s*[^;,=\s]+=)/)) {
    const [pair, ...attrs] = part.trim().split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a));
    if (expired || value === '') out[name] = '';
    else out[name] = value;
  }
  return out;
}

export function mergeCookies(jar: Record<string, string>, updates: Record<string, string>) {
  const next = { ...jar };
  for (const [k, v] of Object.entries(updates)) {
    if (v === '') delete next[k];
    else next[k] = v;
  }
  return next;
}

export const cookieHeader = (jar: Record<string, string>) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

/** Expiry (epoch ms) from a JWT's `exp` claim; 0 if unreadable. */
export function jwtExpiry(jwt: string, decode: (b64: string) => string = globalThis.atob): number {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const exp = JSON.parse(decode(padded)).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** No internet, as the phone reports it (fetch, DNS, socket and timeout errors). */
const OFFLINE_RE = /network|fetch failed|failed to fetch|unknownhost|unable to resolve host|no address associated|timed? ?out|timeout|econn|enotfound|socket|connection (?:refused|reset|abort)|internet/i;

/**
 * A sync or server error, in words for people. Offline isn't an error (edits wait on the phone), so it
 * gets no message. Everything else becomes one plain sentence; the raw text never reaches the screen.
 */
export function describeSyncError(raw: string): { offline: boolean; message: string | null } {
  if (OFFLINE_RE.test(raw)) return { offline: true, message: null };
  if (/sign in again|session expired|\b401\b|jwt/i.test(raw)) return { offline: false, message: 'Your sign-in has expired. Sign in again to keep syncing.' };
  if (/PGRST20[45]|does not exist|schema cache/i.test(raw))
    return { offline: false, message: 'The server needs an update before these changes can upload. They’re kept on this phone.' };
  if (/refused by the server|\b4\d\d\b/.test(raw)) return { offline: false, message: 'Some changes couldn’t be saved to your account. They’re kept on this phone.' };
  return { offline: false, message: 'Couldn’t reach your account right now. Your changes are safe on this phone; we’ll try again.' };
}
