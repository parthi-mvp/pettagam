import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { deviceId } from '@/db/clock';
import { emitChange } from '@/db/events';
import { getSetting, setSetting } from '@/db/repo';
import { SYNCED_TABLES } from '@/db/types';

import { packClocks, type Clock, type Row } from './crdt';
import * as Drive from './drive';
import { groupDevices, KEEP_LOGS, logName, ownFiles, parseName, planPull, snapshotName, SNAPSHOT_EVERY, staleDevices, VAULT_FILE, type DeviceInfo, type RemoteFile } from './drive-plan';
import { describeSyncError } from './errors';
import { buildSnapshot, mergeIn, type Snapshot } from './snapshot';
import { deriveKey, fromBase64, isKeySealed, KDF, openWithKey, sealWithKey, toBase64, WrongPasswordError, type KeySealed } from './vault';

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
 *
 * Optional end-to-end encryption ("Encrypt my Drive backup"): a sync password, entered once on each
 * phone. VAULT_FILE holds its salt and a check value; the derived key stays in this phone's secure
 * storage. Every file a phone writes is then AES-256-GCM encrypted (src/sync/vault.ts).
 */

export type SyncStatus = {
  /** off = Google Drive not connected (data only on this phone). */
  /** locked = Drive backup is encrypted and this phone doesn't have the sync password yet. */
  state: 'off' | 'idle' | 'syncing' | 'error' | 'offline' | 'locked';
  /** "Encrypt my Drive backup" is on for this account. */
  encrypted: boolean;
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

let status: SyncStatus = { state: 'off', encrypted: false, pending: 0, lastSyncAt: null, account: null, error: null, detail: null };
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

/** This phone's model, written on its files so the devices list can name it ("Samsung SM-S918B"). */
function deviceName(): string {
  const c = Platform.constants as { Brand?: string; Model?: string };
  if (Platform.OS === 'ios') return 'iPhone';
  return [c.Brand && c.Brand[0].toUpperCase() + c.Brand.slice(1), c.Model].filter(Boolean).join(' ').slice(0, 60) || 'Android phone';
}

const readJson = async <T,>(db: SQLiteDatabase, key: string, fallback: T): Promise<T> => {
  const v = await getSetting(db, key);
  return v ? (JSON.parse(v) as T) : fallback;
};
const writeJson = (db: SQLiteDatabase, key: string, v: unknown) => setSetting(db, key, JSON.stringify(v));

// ---- Encryption ("Encrypt my Drive backup") ----

const KEY_STORE = 'pettagam_drive_key';
const VAULT_CHECK = 'pettagam-vault';
const random = (n: number) => Crypto.getRandomBytes(n);
type Vault = { salt: string; kdf: typeof KDF; check: KeySealed };

class VaultLockedError extends Error {
  constructor() {
    super('VAULT_LOCKED');
  }
}

const storedKey = async () => {
  const k = await SecureStore.getItemAsync(KEY_STORE);
  return k ? fromBase64(k) : null;
};
const vaultOn = async (db: SQLiteDatabase) => (await getSetting(db, 'drive_vault')) === '1';

/** A downloaded file as plain data: decrypted when it's encrypted (locked without the key). */
async function readFile(id: string): Promise<Snapshot | null> {
  const raw = await Drive.download<unknown>(id);
  if (raw == null || !isKeySealed(raw)) return raw as Snapshot | null;
  const key = await storedKey();
  if (!key) throw new VaultLockedError();
  return JSON.parse(openWithKey(raw, key)) as Snapshot;
}

/** The text to upload: encrypted while encryption is on (never plain without the key). */
async function fileBody(db: SQLiteDatabase, data: Snapshot): Promise<string> {
  const json = JSON.stringify(data);
  if (!(await vaultOn(db))) return json;
  const key = await storedKey();
  if (!key) throw new VaultLockedError();
  return JSON.stringify(sealWithKey(json, key, random));
}

/**
 * Write a full snapshot on the next sync; `purge` then removes ALL of this phone's change files (not
 * just old ones), e.g. so plain ones don't stay once encryption is turned on.
 */
export async function requestSnapshot(db: SQLiteDatabase, purge = false) {
  const own = await readJson<{ id: string; seq: number } | null>(db, 'drive_own_snapshot', null);
  if (own) await writeJson(db, 'drive_own_snapshot', { ...own, seq: -SNAPSHOT_EVERY });
  if (purge) await setSetting(db, 'drive_purge', '1');
}

/** Turn encryption on for this Google account with a new sync password. */
export async function enableDriveEncryption(db: SQLiteDatabase, password: string) {
  if (await Drive.findByName(VAULT_FILE)) throw new Error('VAULT_EXISTS');
  const salt = random(16);
  const key = await deriveKey(password, salt);
  const vault: Vault = { salt: toBase64(salt), kdf: KDF, check: sealWithKey(VAULT_CHECK, key, random) };
  await Drive.upload(VAULT_FILE, JSON.stringify(vault));
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
  await setSetting(db, 'drive_vault', '1');
  await requestSnapshot(db, true);
  await syncNow(db);
}

/** On another phone: enter the sync password (WrongPasswordError if it doesn't match). */
export async function unlockDriveEncryption(db: SQLiteDatabase, password: string) {
  const f = await Drive.findByName(VAULT_FILE);
  const vault = f ? await Drive.download<Vault>(f.id) : null;
  if (!vault) throw new Error('VAULT_GONE');
  const key = await deriveKey(password, fromBase64(vault.salt), vault.kdf);
  if (openWithKey(vault.check, key) !== VAULT_CHECK) throw new WrongPasswordError();
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
  await setSetting(db, 'drive_vault', '1');
  await requestSnapshot(db, true);
  await syncNow(db);
}

/** Turn encryption off for the account: this phone rewrites its files plain; the others follow. */
export async function disableDriveEncryption(db: SQLiteDatabase) {
  const f = await Drive.findByName(VAULT_FILE);
  if (f) await Drive.remove(f.id);
  await setSetting(db, 'drive_vault', null);
  await requestSnapshot(db, true);
  await syncNow(db);
}

/**
 * Forgot the sync password: delete every Pettagam file in this Drive and back up afresh from this
 * phone (unencrypted). Other phones keep their own data and back up again once they sync.
 */
export async function resetDriveBackup(db: SQLiteDatabase) {
  for (const f of await Drive.listFiles()) await Drive.remove(f.id);
  const v = await Drive.findByName(VAULT_FILE);
  if (v) await Drive.remove(v.id);
  await SecureStore.deleteItemAsync(KEY_STORE);
  await db.runAsync("DELETE FROM settings WHERE key IN ('drive_applied', 'drive_listed_until', 'drive_own_snapshot', 'drive_vault', 'drive_purge')");
  setStatus({ encrypted: false });
  await syncNow(db);
}

/** Load the stored account, last backup time and pending count into the status (on start, after edits). */
export async function refreshPending(db: SQLiteDatabase) {
  const [account, last, pending, encrypted] = await Promise.all([getSetting(db, 'drive_account'), getSetting(db, 'last_sync_at'), pendingCount(db), vaultOn(db)]);
  setStatus({
    account,
    encrypted,
    pending,
    lastSyncAt: last ? Number(last) : null,
    ...(status.state === 'syncing' ? {} : { state: account ? (status.state === 'off' ? 'idle' : status.state) : 'off' }),
  });
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
    // Encryption turned on or off from another phone? (One small lookup; keeps every phone in step.)
    const vault = !!(await Drive.findByName(VAULT_FILE));
    if (vault !== (await vaultOn(db))) {
      await setSetting(db, 'drive_vault', vault ? '1' : null);
      if (!vault || (await storedKey())) await requestSnapshot(db, true);
    }
    setStatus({ encrypted: vault });
    const merged = await pull(db, me);
    if (merged) emitChange('*');
    await push(db, me);
    const now = Date.now();
    await setSetting(db, 'last_sync_at', String(now));
    setStatus({ state: 'idle', lastSyncAt: now, pending: await pendingCount(db) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const { offline, message } = describeSyncError(msg);
    const state = e instanceof VaultLockedError ? 'locked' : offline ? 'offline' : 'error';
    setStatus({ state, error: message, detail: offline ? null : msg, pending: await pendingCount(db) });
    throw e;
  }
}

/** Apply other phones' new files. Returns how many rows changed here. */
async function pull(db: SQLiteDatabase, me: string) {
  const since = await getSetting(db, 'drive_listed_until');
  // A minute of overlap: a file written while the last list ran still shows up; re-applying is harmless.
  const files = await Drive.listFiles(since ? new Date(new Date(since).getTime() - 60_000).toISOString() : undefined);
  const applied = await readJson<Record<string, number>>(db, 'drive_applied', {});
  let merged = 0;

  const mergeSnapshot = async (device: string, file: RemoteFile | null) => {
    const f = file ?? (await Drive.findByName(snapshotName(device)));
    const snap = f ? await readFile(f.id) : null;
    if (!f || !snap) return;
    merged += await mergeIn(db, snap);
    const p = parseName(f);
    if (p?.kind === 'snapshot') applied[device] = Math.max(applied[device] ?? 0, p.seq);
  };

  // On a full listing (first sync after connecting): files under our own id that this install didn't
  // write, i.e. an earlier install's (a reinstall keeps the id, src/db/clock.ts). Read them like another
  // phone's and continue from their numbering, so no change file name is ever reused.
  const actions = planPull(files, me, applied);
  const localSeq = await getSetting(db, 'drive_own_seq');
  const found = since ? null : ownFiles(files, me);
  const own = found?.seq != null && (localSeq == null || found.seq > Number(localSeq)) ? found : null;
  if (own) actions.unshift(...own.actions);

  for (const a of actions) {
    if (a.type === 'snapshot') {
      await mergeSnapshot(a.device, a.file);
    } else {
      if (applied[a.device] != null && a.seq <= applied[a.device]) continue; // the snapshot already had it
      const log = await readFile(a.file.id);
      // Gone: that phone cleaned it up after a snapshot, which holds it instead.
      if (!log) await mergeSnapshot(a.device, null);
      else {
        merged += await mergeIn(db, log);
        applied[a.device] = a.seq;
      }
    }
  }

  if (own) {
    delete applied[me];
    await setSetting(db, 'drive_own_seq', String(own.seq));
    if (own.snapshot) await writeJson(db, 'drive_own_snapshot', { id: own.snapshot.file.id, seq: own.snapshot.seq });
  }
  await writeJson(db, 'drive_applied', applied);
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
    const body: Snapshot = { kind: 'changes', exportedAt: Date.now(), deviceId: me, tables, clocks: packClocks(changed) };
    await Drive.upload(logName(me, seq), await fileBody(db, body), undefined, { name: deviceName() });
    // Saved straight away: a crash after the upload must not reuse this seq for different changes.
    await setSetting(db, 'drive_own_seq', String(seq));
    await setSetting(db, 'drive_up_clock', changed[changed.length - 1].hlc);
  }

  // 2. A full snapshot: the first time, then every 50 change files.
  if (own && seq - own.seq < SNAPSHOT_EVERY) return;
  const snap = await buildSnapshot(db, me);
  // shortcut: the snapshot is the whole database (fine to a few MB, ~10k entries); it's only written every 50 change files.
  const props = { seq: String(seq), name: deviceName() };
  const body = await fileBody(db, snap);
  const existing = own?.id ?? (await Drive.findByName(snapshotName(me)))?.id;
  const file = await Drive.upload(snapshotName(me), body, existing, props).catch((e) => {
    // Removed from another phone's devices list: write it afresh.
    if (existing && /Google Drive 404/.test(String(e))) return Drive.upload(snapshotName(me), body, undefined, props);
    throw e;
  });
  own = { id: file.id, seq };
  await writeJson(db, 'drive_own_snapshot', own);

  // 3. Clean up: change files the snapshot holds, except the newest few (phones that are only a little
  // behind keep reading small files instead of the whole snapshot); all of them after an encryption change.
  const keep = (await getSetting(db, 'drive_purge')) === '1' ? 0 : KEEP_LOGS;
  const all = await Drive.listFiles();
  for (const f of all) {
    const p = parseName(f);
    if (p?.kind === 'log' && p.device === me && p.seq <= seq - keep) await Drive.remove(f.id);
  }
  await setSetting(db, 'drive_purge', null);
  // And phones gone for months (a reinstall, a sold phone) whose every change is already here.
  const applied = await readJson<Record<string, number>>(db, 'drive_applied', {});
  for (const d of staleDevices(groupDevices(all), me, applied, Date.now())) for (const f of d.files) await Drive.remove(f.id);
}

/** Phones backing up to this Google account (this one included), most recently seen first. */
export async function listDevices(db: SQLiteDatabase): Promise<{ me: string; devices: DeviceInfo[] }> {
  return { me: await deviceId(db), devices: groupDevices(await Drive.listFiles()) };
}

/**
 * Remove a phone's files from Drive (a sold phone, an old install). Syncs first, so everything it
 * wrote is kept here and in this phone's snapshot; if that phone is still in use, it simply backs up
 * again next time.
 */
export async function removeDevice(db: SQLiteDatabase, device: string) {
  await syncNow(db);
  // A fresh snapshot of this phone first: its change files hold only its own edits, while the snapshot
  // holds everything merged here, so phones that never read the removed phone's files still get them.
  await requestSnapshot(db);
  await syncNow(db);
  const { devices } = await listDevices(db);
  for (const f of devices.find((d) => d.device === device)?.files ?? []) await Drive.remove(f.id);
  const applied = await readJson<Record<string, number>>(db, 'drive_applied', {});
  delete applied[device];
  await writeJson(db, 'drive_applied', applied);
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
  await SecureStore.deleteItemAsync(KEY_STORE);
  // What was read from this account. Kept: drive_own_seq, so this phone's next change file never reuses a number.
  await db.runAsync(
    "DELETE FROM settings WHERE key IN ('drive_applied', 'drive_listed_until', 'drive_own_snapshot', 'drive_vault', 'drive_purge')"
  );
  setStatus({ state: 'off', encrypted: false, account: null, error: null, detail: null });
}
