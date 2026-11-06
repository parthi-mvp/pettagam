// What to download from Drive and in what order (no imports → unit-tested in Node, see tests/drive-plan.test.ts).
//
// Files in the app folder, per phone ("device"):
//   pettagam-<device>.json        its full snapshot; appProperties.seq = the last change file it includes
//   log-<device>-<seq>.json       one batch of its own edits since the previous file (seq 1, 2, 3…)
// Each phone keeps, per other phone, the last seq it applied. New change files after that are applied
// in order; a gap (files deleted after a snapshot) or a phone seen for the first time means reading
// its snapshot first, then any change files after the snapshot's seq.

export type RemoteFile = { id: string; name: string; modifiedTime: string; appProperties?: Record<string, string> };

export const SNAPSHOT_PREFIX = 'pettagam-';
export const LOG_PREFIX = 'log-';

/**
 * With "Encrypt my Drive backup" on: the salt and a check value for the sync password (never the key).
 * Its name doesn't match a device file, so planning and the devices list ignore it.
 */
export const VAULT_FILE = 'pettagam-vault-key.json';

/** The Drive search for Pettagam's files (all, or changed after `since`, RFC 3339). */
export const listQuery = (since?: string) =>
  `(name contains '${SNAPSHOT_PREFIX}' or name contains '${LOG_PREFIX}') and trashed = false${since ? ` and modifiedTime > '${since}'` : ''}`;

export const snapshotName = (device: string) => `${SNAPSHOT_PREFIX}${device}.json`;
export const logName = (device: string, seq: number) => `${LOG_PREFIX}${device}-${String(seq).padStart(8, '0')}.json`;

export type Parsed = { kind: 'snapshot' | 'log'; device: string; seq: number } | null;

export function parseName(f: RemoteFile): Parsed {
  let m = /^log-([a-z0-9]+)-(\d+)\.json$/.exec(f.name);
  if (m) return { kind: 'log', device: m[1], seq: Number(m[2]) };
  m = /^pettagam-([a-z0-9]+)\.json$/.exec(f.name);
  if (m) {
    // Written before its first change file, a snapshot's seq is 0.
    return { kind: 'snapshot', device: m[1], seq: Number(f.appProperties?.seq) || 0 };
  }
  return null;
}

export type Action =
  /** Merge a snapshot; `file` null = look it up by name (it wasn't among the recently changed files). */
  | { type: 'snapshot'; device: string; file: RemoteFile | null; seq: number | null }
  | { type: 'log'; device: string; file: RemoteFile; seq: number };

/**
 * @param files     files changed since the last check (or all of them)
 * @param applied   per other device, the last seq applied here (absent = never seen)
 */
export function planPull(files: RemoteFile[], me: string, applied: Record<string, number>): Action[] {
  const actions: Action[] = [];
  const devices = new Map<string, { snapshot: { file: RemoteFile; seq: number } | null; logs: { file: RemoteFile; seq: number }[] }>();
  const entry = (d: string) => devices.get(d) ?? devices.set(d, { snapshot: null, logs: [] }).get(d)!;

  for (const f of files) {
    const p = parseName(f);
    if (!p || p.device === me) continue;
    if (p.kind === 'snapshot') entry(p.device).snapshot = { file: f, seq: p.seq };
    else entry(p.device).logs.push({ file: f, seq: p.seq });
  }

  for (const [device, { snapshot, logs }] of devices) {
    const last = applied[device];
    const pending = logs.filter((l) => last == null || l.seq > last).sort((a, b) => a.seq - b.seq);

    const firstTime = last == null;
    const gap = !firstTime && pending.length > 0 && pending[0].seq > last + 1;
    let from = last ?? 0;
    if (firstTime || gap) {
      // Start from the snapshot (its seq tells which change files it already holds).
      actions.push({ type: 'snapshot', device, file: snapshot?.file ?? null, seq: snapshot?.seq ?? null });
      if (snapshot) from = Math.max(from, snapshot.seq);
      else from = -1; // not known yet: apply every change file after the lookup decides
    }
    for (const l of pending) if (from < 0 || l.seq > from) actions.push({ type: 'log', device, file: l.file, seq: l.seq });
  }
  return actions;
}

/**
 * This phone's own files already on Drive: after a reinstall (same device id, see src/db/clock.ts)
 * the new install reads them back like another phone's, then carries on numbering from `seq`.
 */
export function ownFiles(files: RemoteFile[], me: string) {
  const mine = files.filter((f) => parseName(f)?.device === me);
  let seq: number | null = null;
  let snapshot: { file: RemoteFile; seq: number } | null = null;
  for (const f of mine) {
    const p = parseName(f)!;
    seq = Math.max(seq ?? 0, p.seq);
    if (p.kind === 'snapshot') snapshot = { file: f, seq: p.seq };
  }
  // Read in the same order as another phone's: its snapshot, then change files after it.
  return { seq, snapshot, actions: planPull(mine, '', {}) };
}

/** Snapshot every this many change files; then keep only the newest few change files. */
export const SNAPSHOT_EVERY = 50;
export const KEEP_LOGS = 20;

export type DeviceInfo = {
  device: string;
  /** The phone's model as it wrote it (appProperties.name), if any. */
  name: string | null;
  /** Its newest file's time: roughly when it last backed up. */
  lastSeen: string;
  /** Highest change file seq it has on Drive (its snapshot's when it has none). */
  maxSeq: number | null;
  files: RemoteFile[];
};

/** Every phone with files in the app folder, most recently seen first. */
export function groupDevices(files: RemoteFile[]): DeviceInfo[] {
  const byDevice = new Map<string, DeviceInfo>();
  for (const f of files) {
    const p = parseName(f);
    if (!p) continue;
    const d = byDevice.get(p.device) ?? byDevice.set(p.device, { device: p.device, name: null, lastSeen: '', maxSeq: null, files: [] }).get(p.device)!;
    d.files.push(f);
    if (f.modifiedTime > d.lastSeen) {
      d.lastSeen = f.modifiedTime;
      d.name = f.appProperties?.name ?? d.name;
    } else d.name ??= f.appProperties?.name ?? null;
    d.maxSeq = Math.max(d.maxSeq ?? 0, p.seq);
  }
  return [...byDevice.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}

/** A phone not seen for this long, whose changes this phone already holds, has its files removed. */
export const STALE_DEVICE_MS = 180 * 86_400_000;

/** Phones safe to clean up automatically: long unseen, and everything they wrote is already applied here. */
export function staleDevices(devices: DeviceInfo[], me: string, applied: Record<string, number>, now: number): DeviceInfo[] {
  return devices.filter(
    (d) => d.device !== me && now - new Date(d.lastSeen).getTime() > STALE_DEVICE_MS && d.maxSeq != null && (applied[d.device] ?? -1) >= d.maxSeq
  );
}
