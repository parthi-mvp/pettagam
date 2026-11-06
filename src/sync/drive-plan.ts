// What to download from Drive and in what order (no imports → unit-tested in Node, see tests/drive-plan.test.ts).
//
// Files in the app folder, per phone ("device"):
//   pettagam-<device>.json        its full snapshot; appProperties.seq = the last change file it includes
//   log-<device>-<seq>.json       one batch of its own edits since the previous file (seq 1, 2, 3…)
//   expense-manager-sync.json     the one shared file of the very first version
// Each phone keeps, per other phone, the last seq it applied. New change files after that are applied
// in order; a gap (files deleted after a snapshot) or a phone seen for the first time means reading
// its snapshot first, then any change files after the snapshot's seq.

export type RemoteFile = { id: string; name: string; modifiedTime: string; appProperties?: Record<string, string> };

export const SNAPSHOT_PREFIX = 'pettagam-';
export const LOG_PREFIX = 'log-';
export const LEGACY_FILE = 'expense-manager-sync.json';

export const snapshotName = (device: string) => `${SNAPSHOT_PREFIX}${device}.json`;
export const logName = (device: string, seq: number) => `${LOG_PREFIX}${device}-${String(seq).padStart(8, '0')}.json`;

export type Parsed = { kind: 'snapshot'; device: string; seq: number | null } | { kind: 'log'; device: string; seq: number } | { kind: 'legacy' } | null;

export function parseName(f: RemoteFile): Parsed {
  if (f.name === LEGACY_FILE) return { kind: 'legacy' };
  let m = /^log-([a-z0-9]+)-(\d+)\.json$/.exec(f.name);
  if (m) return { kind: 'log', device: m[1], seq: Number(m[2]) };
  m = /^pettagam-([a-z0-9]+)\.json$/.exec(f.name);
  if (m) {
    const seq = f.appProperties?.seq;
    return { kind: 'snapshot', device: m[1], seq: seq != null && /^\d+$/.test(seq) ? Number(seq) : null };
  }
  return null;
}

export type Action =
  /** Merge a snapshot; `file` null = look it up by name (it wasn't among the recently changed files). */
  | { type: 'snapshot'; device: string; file: RemoteFile | null; seq: number | null }
  | { type: 'log'; device: string; file: RemoteFile; seq: number }
  | { type: 'legacy'; file: RemoteFile };

/**
 * @param files     files changed since the last check (or all of them)
 * @param applied   per other device, the last seq applied here (absent = never seen)
 * @param seen      file id → modifiedTime already merged (for snapshots without seq, and the legacy file)
 */
export function planPull(files: RemoteFile[], me: string, applied: Record<string, number>, seen: Record<string, string>): Action[] {
  const actions: Action[] = [];
  const devices = new Map<string, { snapshot: { file: RemoteFile; seq: number | null } | null; logs: { file: RemoteFile; seq: number }[] }>();
  const entry = (d: string) => devices.get(d) ?? devices.set(d, { snapshot: null, logs: [] }).get(d)!;

  for (const f of files) {
    const p = parseName(f);
    if (!p) continue;
    if (p.kind === 'legacy') {
      if (seen[f.id] !== f.modifiedTime) actions.push({ type: 'legacy', file: f });
      continue;
    }
    if (p.device === me) continue;
    if (p.kind === 'snapshot') entry(p.device).snapshot = { file: f, seq: p.seq };
    else entry(p.device).logs.push({ file: f, seq: p.seq });
  }

  for (const [device, { snapshot, logs }] of devices) {
    const last = applied[device];
    const pending = logs.filter((l) => last == null || l.seq > last).sort((a, b) => a.seq - b.seq);

    // A phone on an older app version writes only snapshots (no seq): merge it whenever it changes.
    if (snapshot && snapshot.seq == null) {
      if (seen[snapshot.file.id] !== snapshot.file.modifiedTime) actions.push({ type: 'snapshot', device, file: snapshot.file, seq: null });
      continue;
    }

    const firstTime = last == null;
    const gap = !firstTime && pending.length > 0 && pending[0].seq > last + 1;
    let from = last ?? 0;
    if (firstTime || gap) {
      // Start from the snapshot (its seq tells which change files it already holds).
      actions.push({ type: 'snapshot', device, file: snapshot?.file ?? null, seq: snapshot?.seq ?? null });
      if (snapshot?.seq != null) from = Math.max(from, snapshot.seq);
      else if (!snapshot) from = -1; // not known yet: apply every change file after the lookup decides
    }
    for (const l of pending) if (from < 0 || l.seq > from) actions.push({ type: 'log', device, file: l.file, seq: l.seq });
  }
  return actions;
}

/** Snapshot every this many change files; then keep only the newest few change files. */
export const SNAPSHOT_EVERY = 50;
export const KEEP_LOGS = 20;
