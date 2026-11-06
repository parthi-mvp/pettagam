// Sync errors in plain words (no imports → unit-tested in Node, see tests/sync-errors.test.ts).

/** No internet, as the phone reports it (fetch, DNS, socket and timeout errors). */
const OFFLINE_RE = /network|fetch failed|failed to fetch|unknownhost|unable to resolve host|no address associated|timed? ?out|timeout|econn|enotfound|socket|connection (?:refused|reset|abort)|internet/i;

/**
 * A backup error, in words for people. Offline isn't an error (edits wait on the phone), so it gets
 * no message. Everything else becomes one plain sentence; the raw text never reaches the screen.
 */
export function describeSyncError(raw: string): { offline: boolean; message: string | null } {
  if (OFFLINE_RE.test(raw)) return { offline: true, message: null };
  if (/storageQuotaExceeded|quota/i.test(raw)) return { offline: false, message: 'Your Google Drive is full. Free up space to keep backing up.' };
  if (/\b401\b|sign.?in|SIGN_IN_REQUIRED|invalid_grant|token/i.test(raw))
    return { offline: false, message: 'Google needs you to sign in again. Reconnect Google Drive in Backup.' };
  if (/\b403\b|insufficient|scope/i.test(raw)) return { offline: false, message: 'Pettagam no longer has access to Drive. Reconnect Google Drive in Backup.' };
  return { offline: false, message: 'Couldn’t reach Google Drive right now. Your data is safe on this phone; we’ll try again.' };
}
