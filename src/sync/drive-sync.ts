import type { SQLiteDatabase } from 'expo-sqlite';

import { deviceId, observeClock, stampFields } from '@/db/clock';
import { mergeDuplicates } from '@/db/dedupe';
import { emitChange } from '@/db/events';
import { getSetting, setSetting, upsertRaw } from '@/db/repo';
import { SYNCED_TABLES } from '@/db/types';

import { mergeRow, packClocks, unpackRow, type Clock, type PackedClocks, type Row } from './crdt';
import * as Drive from './drive';
import { describeSyncError } from './errors';

/** A phone's backup file. Format 2 adds each column's clock; format 1 (older app) has rows only. */
type Snapshot = { format: 1 | 2; exportedAt: number; deviceId: string; tables: Record<string, Row[]>; clocks?: PackedClocks };

/**
 * Backup and multi-device sync through the user's own Google Drive (hidden app folder), no server.
 *
 * Each phone writes ONE file, pettagam-<device>.json: a full snapshot of its database with the clock
 * of every column, soft-deleted rows included so deletions travel too. A sync reads the other phones'
 * files that changed since it last looked and merges them in column by column (src/sync/crdt.ts: the
 * latest write to each field wins, so edits to different fields of one entry both survive), then
 * rewrites its own file.
 * Phones never write the same file, so no upload can overwrite another phone's edits.
 * The outbox table marks "changed since the last upload".
 */

export type SyncStatus = {
  /** off = Google Drive not connected (data only on this phone). */
  state: 'off' | 'idle' | 'syncing' | 'error' | 'offline';
  /** Changes on this phone not backed up yet. */
  pending: number;
  lastSyncAt: number | null;
  /** The Google account backing up to, or null. */
  account: string | null;
  /** A plain sentence for people (describeSyncError); null when fine or just offline. */
  error: string | null;
  /** The raw error, for development builds only. */
  detail: string | null;
};

let status: SyncStatus = { state: 'off', pending: 0, lastSyncAt: null, account: null, error: null, detail: null };
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

/** Load the stored account, last backup time and pending count into the status (on start, after edits). */
export async function refreshPending(db: SQLiteDatabase) {
  const [account, last, pending] = await Promise.all([getSetting(db, 'drive_account'), getSetting(db, 'last_sync_at'), pendingCount(db)]);
  setStatus({
    account,
    pending,
    lastSyncAt: last ? Number(last) : null,
    ...(status.state === 'syncing' ? {} : { state: account ? (status.state === 'off' ? 'idle' : status.state) : 'off' }),
  });
}

/** Merge another phone's snapshot in, field by field. Returns how many rows changed here. */
async function mergeIn(db: SQLiteDatabase, snap: Snapshot) {
  let changed = 0;
  let newest: Clock | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const table of SYNCED_TABLES) {
      const remoteRows = snap.tables[table];
      if (!remoteRows?.length) continue;
      const localRows = new Map((await txn.getAllAsync<Row>(`SELECT * FROM ${table}`)).map((r) => [r.id, r]));
      const localClocks = new Map<string, Record<string, Clock>>();
      for (const c of await txn.getAllAsync<{ row_id: string; col: string; hlc: Clock }>('SELECT row_id, col, hlc FROM field_clock WHERE tbl = ?', [table])) {
        (localClocks.get(c.row_id) ?? localClocks.set(c.row_id, {}).get(c.row_id)!)[c.col] = c.hlc;
      }
      for (const remote of remoteRows) {
        const local = localRows.get(remote.id);
        const m = mergeRow(local ? { row: local, clocks: localClocks.get(remote.id) ?? {} } : null, {
          row: remote,
          clocks: unpackRow(snap.clocks, table, remote),
        });
        if (!m) continue;
        // A new row goes in whole; an existing one gets only the columns that won.
        await upsertRaw(txn, table, local ? { ...local, ...m.patch } : { ...remote, ...m.patch });
        for (const [col, c] of Object.entries(m.clocks)) {
          await stampFields(txn, table, remote.id, [col], c);
          if (!newest || c > newest) newest = c;
        }
        changed++;
      }
    }
  });
  if (newest) await observeClock(db, newest);
  return changed;
}

let running: Promise<void> | null = null;

/** Back up now: pull other phones' changes, then upload this phone's snapshot. No-op when Drive is off. */
export function syncNow(db: SQLiteDatabase): Promise<void> {
  // One at a time; a second call while one runs waits for it instead of racing it.
  running ??= run(db).finally(() => {
    running = null;
  });
  return running;
}

async function run(db: SQLiteDatabase) {
  const account = await getSetting(db, 'drive_account');
  if (!account) {
    setStatus({ state: 'off', account: null, pending: await pendingCount(db) });
    return;
  }
  setStatus({ state: 'syncing', account, error: null, detail: null });
  try {
    const me = `${Drive.FILE_PREFIX}${await deviceId(db)}.json`;
    const files = await Drive.listBackups();
    const own = files.find((f) => f.name === me);

    // 1. Pull: every other phone's file that changed since this phone last read it.
    let merged = 0;
    for (const f of files) {
      if (f.name === me) continue;
      const key = `drive_seen_${f.id}`;
      if ((await getSetting(db, key)) === f.modifiedTime) continue;
      const snap = await Drive.download<Snapshot>(f.id);
      if ((snap?.format === 1 || snap?.format === 2) && snap.tables) merged += await mergeIn(db, snap);
      await setSetting(db, key, f.modifiedTime);
    }
    // Another phone may have made the same SMS entry or category before ids were shared.
    if (merged) {
      await mergeDuplicates(db);
      emitChange('*');
    }

    // 2. Push: rewrite this phone's file when something changed here (or it's the first backup).
    // Rows edited during the upload get a newer outbox entry (higher rowid) and stay queued.
    const mark = (await db.getFirstAsync<{ m: number | null }>('SELECT MAX(rowid) AS m FROM outbox'))?.m ?? 0;
    if (!own || mark > 0 || merged > 0) {
      const tables: Record<string, Row[]> = {};
      for (const t of SYNCED_TABLES) tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
      const clocks = packClocks(await db.getAllAsync<{ tbl: string; row_id: string; col: string; hlc: Clock }>('SELECT tbl, row_id, col, hlc FROM field_clock'));
      const snap: Snapshot = { format: 2, exportedAt: Date.now(), deviceId: me, tables, clocks };
      // shortcut: uploads the whole database each time (fine to a few MB, ~10k entries); send changes only if it grows past that.
      await Drive.upload(me, JSON.stringify(snap), own?.id);
      await db.runAsync('DELETE FROM outbox WHERE rowid <= ?', [mark]);
    }

    const now = Date.now();
    await setSetting(db, 'last_sync_at', String(now));
    setStatus({ state: 'idle', lastSyncAt: now, pending: await pendingCount(db) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const { offline, message } = describeSyncError(msg);
    setStatus({ state: offline ? 'offline' : 'error', error: message, detail: offline ? null : msg, pending: await pendingCount(db) });
    throw e;
  }
}

/** Sign in to Google and start backing up. Existing backups (another phone, a reinstall) merge in first. */
export async function connectDrive(db: SQLiteDatabase): Promise<string | null> {
  const email = await Drive.signIn();
  if (!email) return null;
  await setSetting(db, 'drive_account', email);
  setStatus({ account: email, state: 'idle' });
  await syncNow(db);
  return email;
}

/** Stop backing up. The data stays on this phone, and the backup stays in Drive. */
export async function disconnectDrive(db: SQLiteDatabase) {
  await Drive.signOut();
  await setSetting(db, 'drive_account', null);
  await db.runAsync("DELETE FROM settings WHERE key LIKE 'drive_seen_%'");
  setStatus({ state: 'off', account: null, error: null, detail: null });
}
