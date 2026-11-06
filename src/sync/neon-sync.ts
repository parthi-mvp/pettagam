import type { SQLiteDatabase } from 'expo-sqlite';

import { ensureCashAccount } from '@/db/cash';
import { emitChange } from '@/db/events';
import { enqueue, getSetting, setSetting, upsertRaw } from '@/db/repo';
import { seedCategories } from '@/db/schema';
import { SYNCED_TABLES, type TableName } from '@/db/types';

import { isRowRejection, rowsSince, upsertRows } from './data-api';
import { fromServer, shouldApplyRemote, toServer, uploadRows } from './wire';

/**
 * Option B: Neon is the source of truth; SQLite on the phone is an offline cache.
 *
 *  - Every local edit writes to the cache and queues the row in `outbox` (see repo.save).
 *  - syncNow(): 1) uploads queued rows to the Data API, 2) pulls rows changed on the server since
 *    this phone's cursor (`rev`), so other devices' edits show up here.
 *  - Conflicts: the server keeps whichever edit has the later `updated_at` (Postgres trigger).
 */

const PUSH_BATCH = 200;
const PULL_PAGE = 500;
// Re-read rows the server wrote in the last 2 minutes before the newest one seen: a slow upload can
// commit a lower rev after a higher one was pulled. Counted in server time, not in revs, because the
// rev sequence is shared by every user. Re-applying a row is harmless.
// shortcut: assumes no upload transaction runs longer than 2 minutes, raise it if one ever does.
const PULL_OVERLAP_MS = 2 * 60_000;

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'error' | 'offline';
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
};

let status: SyncStatus = { state: 'idle', pending: 0, lastSyncAt: null, error: null };
const listeners = new Set<(s: SyncStatus) => void>();

export const getSyncStatus = () => status;
export function onSyncStatus(l: (s: SyncStatus) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export async function pendingCount(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return r?.n ?? 0;
}

export async function refreshPending(db: SQLiteDatabase) {
  const last = await getSetting(db, 'last_sync_at');
  setStatus({ pending: await pendingCount(db), lastSyncAt: last ? Number(last) : null });
}

async function push(db: SQLiteDatabase) {
  // Page by seq, not "the oldest 200": rows the server rejects stay queued without blocking the rest.
  let after = 0;
  let rejected: string | null = null;
  for (;;) {
    const items = await db.getAllAsync<{ seq: number; table_name: TableName; row_id: string }>(
      'SELECT seq, table_name, row_id FROM outbox WHERE seq > ? ORDER BY seq LIMIT ?',
      [after, PUSH_BATCH]
    );
    if (items.length === 0) break;
    after = items[items.length - 1].seq;
    for (const table of SYNCED_TABLES) {
      const batch = items.filter((i) => i.table_name === table);
      if (batch.length === 0) continue;
      const placeholders = batch.map(() => '?').join(',');
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE id IN (${placeholders})`,
        batch.map((b) => b.row_id)
      );
      const failed = await uploadRows(rows.map(toServer), (r) => upsertRows(table, r), isRowRejection);
      for (const [id, reason] of failed) {
        rejected ??= `${table} ${id}: ${reason}`;
        console.warn('sync: server rejected', table, id, reason);
      }
      // Delete by seq: if the row was edited again during the upload it got a new seq and stays queued.
      const done = batch.filter((b) => !failed.has(b.row_id)).map((b) => b.seq);
      if (done.length) await db.runAsync(`DELETE FROM outbox WHERE seq IN (${done.map(() => '?').join(',')})`, done);
    }
    setStatus({ pending: await pendingCount(db) });
  }
  // Rejected rows stay queued (editing the row re-queues a fixed copy); say so instead of "Up to date".
  if (rejected) throw new Error(`Some changes were refused by the server and are still waiting: ${rejected}`);
}

async function pull(db: SQLiteDatabase): Promise<number> {
  let applied = 0;
  for (const table of SYNCED_TABLES) {
    const cursorKey = `rev_${table}`;
    // Under 'rev_' so wipeLocalData clears it with the cursors: newest server_updated_at pulled (epoch ms).
    const seenKey = `rev_seen_${table}`;
    const from = Number((await getSetting(db, cursorKey)) ?? 0);
    let cursor = from;
    let seen = Number((await getSetting(db, seenKey)) ?? 0);
    const recentSince = seen > 0 ? new Date(seen - PULL_OVERLAP_MS).toISOString() : null;
    let after = 0;
    for (;;) {
      const page = await rowsSince(table, from, recentSince, after, PULL_PAGE).catch((e: unknown) => {
        // A table this app version knows but the server doesn't have yet (its migration not applied):
        // skip it rather than failing the whole sync. Anything else is a real error.
        if (/PGRST205|Could not find the table/i.test(String(e instanceof Error ? e.message : e))) return null;
        throw e;
      });
      if (!page || page.length === 0) break;
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const raw of page) {
          const remote = fromServer(raw);
          const local = await txn.getFirstAsync<{ updated_at: number }>(`SELECT updated_at FROM ${table} WHERE id = ?`, [remote.id]);
          const pending = await txn.getFirstAsync('SELECT 1 FROM outbox WHERE table_name = ? AND row_id = ?', [table, remote.id]);
          if (shouldApplyRemote(remote.updated_at, local, pending != null)) {
            await upsertRaw(txn, table, remote);
            applied++;
          }
        }
      });
      const maxRev = Math.max(...page.map((r) => Number(r.rev)));
      cursor = Math.max(cursor, maxRev);
      seen = Math.max(seen, ...page.map((r) => Date.parse(String(r.server_updated_at)) || 0));
      after = maxRev;
      if (page.length < PULL_PAGE) break;
    }
    await setSetting(db, cursorKey, String(cursor));
    await setSetting(db, seenKey, String(seen));
  }
  return applied;
}

let running: Promise<void> | null = null;

/** Upload pending edits, then download changes. Safe to call often; concurrent calls share one run. */
export function syncNow(db: SQLiteDatabase): Promise<void> {
  if (running) return running;
  running = (async () => {
    setStatus({ state: 'syncing', error: null });
    try {
      // Download first, then upload, and let each run even if the other fails: a rejected upload
      // (e.g. the server's Data API not knowing a new column yet) must not keep the user's data off
      // the phone after a sign-in. Local edits still queued are never overwritten by the download.
      let failure: unknown = null;
      const applied = await pull(db).catch((e) => {
        failure = e;
        return 0;
      });
      if (applied > 0) emitChange('*');
      await push(db).catch((e) => {
        failure ??= e;
      });
      if (failure) throw failure;
      // After the download, so a new phone reuses the user's own cash account instead of adding one.
      await ensureCashAccount(db, false);
      const at = Date.now();
      await setSetting(db, 'last_sync_at', String(at));
      setStatus({ state: 'idle', lastSyncAt: at, pending: await pendingCount(db) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const offline = /network request failed|failed to fetch|network/i.test(msg);
      setStatus({ state: offline ? 'offline' : 'error', error: offline ? null : msg, pending: await pendingCount(db) });
      throw e;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Bind this phone's cache to the signed-in user.
 * - Same user as before: nothing to do.
 * - First sign-in on this phone: keep what's here (e.g. data from the Drive-sync version) and upload it.
 * - A different user: wipe the cache so one person's data never shows under another account.
 */
export async function bindCacheToUser(db: SQLiteDatabase, userId: string) {
  const owner = await getSetting(db, 'cache_owner');
  if (owner === userId) return;
  if (owner && owner !== userId) await wipeLocalData(db);
  await seedCategories(db);
  for (const table of SYNCED_TABLES) {
    const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`);
    for (const r of rows) await enqueue(db, table, r.id);
  }
  await setSetting(db, 'cache_owner', userId);
  emitChange('*');
}

export async function wipeLocalData(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const table of SYNCED_TABLES) await txn.runAsync(`DELETE FROM ${table}`);
    await txn.runAsync('DELETE FROM outbox');
    await txn.runAsync(
      "DELETE FROM settings WHERE key LIKE 'rev_%' OR key IN ('cache_owner', 'last_sync_at', 'sms_cursor')"
    );
  });
  setStatus({ pending: 0, lastSyncAt: null, error: null, state: 'idle' });
  emitChange('*');
}
