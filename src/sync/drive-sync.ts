import type { SQLiteDatabase } from 'expo-sqlite';

import { deviceId, observeClock, stampFields } from '@/db/clock';
import { mergeDuplicates } from '@/db/dedupe';
import { emitChange } from '@/db/events';
import { getSetting, setSetting, upsertRaw } from '@/db/repo';
import { SYNCED_TABLES } from '@/db/types';

import { mergeRow, packClocks, unpackRow, type Clock, type PackedClocks, type Row } from './crdt';
import * as Drive from './drive';
import { KEEP_LOGS, logName, parseName, planPull, snapshotName, SNAPSHOT_EVERY, type RemoteFile } from './drive-plan';
import { describeSyncError } from './errors';

/**
 * A backup file. 2 = snapshot (every row), 3 = change file (only changed fields of changed rows);
 * both carry each column's clock. 1 = the first version's rows-only file.
 */
type Snapshot = { format: 1 | 2 | 3; exportedAt: number; deviceId: string; tables: Record<string, Row[]>; clocks?: PackedClocks };

/**
 * Backup and multi-device sync through the user's own Google Drive (hidden app folder), no server.
 *
 * Every column of every row merges on its own clock (src/sync/crdt.ts), so edits made on different
 * phones, to different fields of one entry, all survive, and every phone ends up the same.
 * Each phone writes only its own files (src/sync/drive-plan.ts):
 *  - after edits, a small change file log-<device>-<seq>.json with just the fields it changed;
 *  - every 50 change files, a full snapshot pettagam-<device>.json, then it deletes its older change
 *    files (keeping the newest 20), so a new phone reads one snapshot rather than years of changes.
 * A sync asks Drive only for files changed since the last look, applies other phones' new change files
 * in order (their snapshot first when it has never seen the phone, or some files were cleaned up),
 * then uploads its own changes. Phones never write the same file, so no upload overwrites another.
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

/** Rows this phone changed since its last upload (its own clocks newer than the upload mark). */
export async function pendingCount(db: SQLiteDatabase) {
  const [me, mark] = await Promise.all([deviceId(db), getSetting(db, 'drive_up_clock')]);
  const r = await db.getFirstAsync<{ n: number }>("SELECT COUNT(DISTINCT tbl || '|' || row_id) AS n FROM field_clock WHERE hlc > ? AND hlc LIKE ?", [
    mark ?? '',
    `%-${me}`,
  ]);
  return r?.n ?? 0;
}

const readJson = async <T,>(db: SQLiteDatabase, key: string, fallback: T): Promise<T> => {
  const v = await getSetting(db, key);
  return v ? (JSON.parse(v) as T) : fallback;
};
const writeJson = (db: SQLiteDatabase, key: string, v: unknown) => setSetting(db, key, JSON.stringify(v));

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
        // A change file edits an entry this phone has never had whole (its snapshot normally brings it): skip.
        if (!local && !('created_at' in remote)) continue;
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
    const me = await deviceId(db);
    const merged = await pull(db, me);
    // Another phone may have made the same SMS entry or category before ids were shared.
    if (merged) {
      await mergeDuplicates(db);
      emitChange('*');
    }
    await push(db, me);
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

/** Apply other phones' new files. Returns how many rows changed here. */
async function pull(db: SQLiteDatabase, me: string) {
  const since = await getSetting(db, 'drive_listed_until');
  // A minute of overlap: a file written while the last list ran still shows up; re-applying is harmless.
  const files = await Drive.listFiles(since ? new Date(new Date(since).getTime() - 60_000).toISOString() : undefined);
  const applied = await readJson<Record<string, number>>(db, 'drive_applied', {});
  const seen = await readJson<Record<string, string>>(db, 'drive_seen', {});
  let merged = 0;

  const mergeSnapshot = async (device: string, file: RemoteFile | null) => {
    const f = file ?? (await Drive.findByName(snapshotName(device)));
    const snap = f ? await Drive.download<Snapshot>(f.id) : null;
    if (!f || !snap) return;
    merged += await mergeIn(db, snap);
    const p = parseName(f);
    if (p?.kind === 'snapshot' && p.seq != null) applied[device] = Math.max(applied[device] ?? 0, p.seq);
    else seen[f.id] = f.modifiedTime;
  };

  for (const a of planPull(files, me, applied, seen)) {
    if (a.type === 'legacy') {
      const snap = await Drive.download<Snapshot>(a.file.id);
      if (snap?.tables) merged += await mergeIn(db, snap);
      seen[a.file.id] = a.file.modifiedTime;
    } else if (a.type === 'snapshot') {
      await mergeSnapshot(a.device, a.file);
    } else {
      if (applied[a.device] != null && a.seq <= applied[a.device]) continue; // the snapshot already had it
      const log = await Drive.download<Snapshot>(a.file.id);
      // Gone: that phone cleaned it up after a snapshot, which holds it instead.
      if (!log) await mergeSnapshot(a.device, null);
      else {
        merged += await mergeIn(db, log);
        applied[a.device] = a.seq;
      }
    }
  }

  await writeJson(db, 'drive_applied', applied);
  await writeJson(db, 'drive_seen', seen);
  const newest = files.reduce((m, f) => (f.modifiedTime > m ? f.modifiedTime : m), since ?? '');
  if (newest) await setSetting(db, 'drive_listed_until', newest);
  return merged;
}

/** Upload this phone's changes since the last upload; a full snapshot now and then, then clean up. */
async function push(db: SQLiteDatabase, me: string) {
  const mark = (await getSetting(db, 'drive_up_clock')) ?? '';
  let seq = Number((await getSetting(db, 'drive_own_seq')) ?? 0);
  let own = await readJson<{ id: string; seq: number } | null>(db, 'drive_own_snapshot', null);

  // 1. A change file with only the fields this phone wrote since the last upload.
  const changed = await db.getAllAsync<{ tbl: string; row_id: string; col: string; hlc: Clock }>(
    'SELECT tbl, row_id, col, hlc FROM field_clock WHERE hlc > ? AND hlc LIKE ? ORDER BY hlc',
    [mark, `%-${me}`]
  );
  if (changed.length) {
    const tables: Record<string, Row[]> = {};
    for (const tbl of SYNCED_TABLES) {
      const cols = new Map<string, Set<string>>();
      for (const c of changed) if (c.tbl === tbl) (cols.get(c.row_id) ?? cols.set(c.row_id, new Set()).get(c.row_id)!).add(c.col);
      if (!cols.size) continue;
      const ids = [...cols.keys()];
      const rows: Row[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        rows.push(...(await db.getAllAsync<Row>(`SELECT * FROM ${tbl} WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk)));
      }
      tables[tbl] = rows.map((r) => {
        const part: Row = { id: r.id, updated_at: r.updated_at };
        for (const col of cols.get(r.id) ?? []) part[col] = r[col];
        return part;
      });
    }
    seq += 1;
    const body: Snapshot = { format: 3, exportedAt: Date.now(), deviceId: me, tables, clocks: packClocks(changed) };
    await Drive.upload(logName(me, seq), JSON.stringify(body));
    // Saved straight away: a crash after the upload must not reuse this seq for different changes.
    await setSetting(db, 'drive_own_seq', String(seq));
    await setSetting(db, 'drive_up_clock', changed[changed.length - 1].hlc);
  }

  // 2. A full snapshot: the first time (it also carries rows from before field clocks), then every 50 files.
  if (own && seq - own.seq < SNAPSHOT_EVERY) return;
  const tables: Record<string, Row[]> = {};
  for (const t of SYNCED_TABLES) tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
  const clocks = packClocks(await db.getAllAsync<{ tbl: string; row_id: string; col: string; hlc: Clock }>('SELECT tbl, row_id, col, hlc FROM field_clock'));
  const snap: Snapshot = { format: 2, exportedAt: Date.now(), deviceId: me, tables, clocks };
  // shortcut: the snapshot is the whole database (fine to a few MB, ~10k entries); it's only written every 50 change files.
  const existing = own?.id ?? (await Drive.findByName(snapshotName(me)))?.id;
  const file = await Drive.upload(snapshotName(me), JSON.stringify(snap), existing, { seq: String(seq) });
  own = { id: file.id, seq };
  await writeJson(db, 'drive_own_snapshot', own);

  // 3. Clean up: change files the snapshot holds, except the newest few (phones that are only a little
  // behind keep reading small files instead of the whole snapshot).
  for (const f of await Drive.listFiles()) {
    const p = parseName(f);
    if (p?.kind === 'log' && p.device === me && p.seq <= seq - KEEP_LOGS) await Drive.remove(f.id);
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
  // What was read from this account. Kept: drive_own_seq, so this phone's next change file never reuses a number.
  await db.runAsync(
    "DELETE FROM settings WHERE key LIKE 'drive_seen_%' OR key IN ('drive_seen', 'drive_applied', 'drive_listed_until', 'drive_own_snapshot')"
  );
  setStatus({ state: 'off', account: null, error: null, detail: null });
}
