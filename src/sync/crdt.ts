// Field-level CRDT for multi-device sync (no imports → unit-tested in Node, see tests/crdt.test.ts).
//
// Every column of every row is its own last-writer-wins register: the value written with the highest
// clock wins. Clocks are hybrid logical clocks (wall time + counter + device), written as strings
// that sort in clock order, so "highest" is plain string comparison. Merging is commutative,
// associative and idempotent: phones that have seen the same edits hold the same data, whatever order
// the edits arrived in.

/** A sortable clock: 9 base-36 digits of ms, 4 of counter, then the device id ("lzx…-0003-ab12"). */
export type Clock = string;

const pad = (n: number, width: number) => n.toString(36).padStart(width, '0');
export const clockOf = (millis: number, counter: number, node: string): Clock => `${pad(millis, 9)}-${pad(counter, 4)}-${node}`;

export function parseClock(c: Clock) {
  const [m, n, ...node] = c.split('-');
  return { millis: parseInt(m, 36), counter: parseInt(n, 36), node: node.join('-') };
}

/** The clock for a new local edit: never behind the wall clock, never behind any clock seen before. */
export function tick(last: Clock | null, wall: number, node: string): Clock {
  const l = last ? parseClock(last) : { millis: 0, counter: 0 };
  const millis = Math.max(l.millis, wall);
  return clockOf(millis, millis === l.millis ? l.counter + 1 : 0, node);
}

/** After merging another phone's clock: move past it, so later local edits beat what was just seen. */
export function observe(last: Clock | null, remote: Clock, wall: number, node: string): Clock {
  const l = last ? parseClock(last) : { millis: 0, counter: 0 };
  const r = parseClock(remote);
  const millis = Math.max(l.millis, r.millis, wall);
  const counter =
    millis === l.millis && millis === r.millis ? Math.max(l.counter, r.counter) + 1 : millis === l.millis ? l.counter + 1 : millis === r.millis ? r.counter + 1 : 0;
  return clockOf(millis, counter, node);
}

/** Columns that aren't registers: the key, and the local "last touched" stamp (kept as the max). */
export const NOT_A_FIELD = new Set(['id', 'updated_at']);

export type Row = { id: string; updated_at: number; [col: string]: unknown };
/** A row with the clock of each of its columns. */
export type RowState = { row: Row; clocks: Record<string, Clock> };

/**
 * A column with no clock was never written: a default category's seeded values, or a column a later
 * migration added. Any real write beats it.
 */
const clockFor = (s: RowState, col: string) => s.clocks[col] ?? '';

/**
 * Merge another phone's copy of a row into ours: each column takes the remote value only when its
 * clock is higher. Returns the changed columns (with updated_at) and their new clocks, or null.
 */
export function mergeRow(local: RowState | null, remote: RowState): { patch: Record<string, unknown>; clocks: Record<string, Clock> } | null {
  const patch: Record<string, unknown> = {};
  const clocks: Record<string, Clock> = {};
  for (const col of Object.keys(remote.row)) {
    if (NOT_A_FIELD.has(col)) continue;
    const rc = clockFor(remote, col);
    if (local && rc <= clockFor(local, col)) continue;
    patch[col] = remote.row[col] ?? null;
    clocks[col] = rc;
  }
  if (Object.keys(patch).length === 0) return null;
  patch.updated_at = Math.max(local?.row.updated_at ?? 0, remote.row.updated_at);
  return { patch, clocks };
}

/** Columns whose value changed from `before` to `after` (all of them for a new row). */
export function changedColumns(before: Record<string, unknown> | null, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((c) => !NOT_A_FIELD.has(c) && (!before || (before[c] ?? null) !== (after[c] ?? null)));
}

/**
 * Clocks in a backup file, compactly: per row, the most common clock as `_` plus only the columns
 * that differ (a row written once has one clock for all its columns).
 */
export type PackedClocks = Record<string, Record<string, { _: Clock; [col: string]: Clock }>>;

export function packClocks(entries: { tbl: string; row_id: string; col: string; hlc: Clock }[]): PackedClocks {
  const byRow = new Map<string, { tbl: string; id: string; cols: Record<string, Clock> }>();
  for (const e of entries) {
    const k = `${e.tbl}\u0000${e.row_id}`;
    let r = byRow.get(k);
    if (!r) byRow.set(k, (r = { tbl: e.tbl, id: e.row_id, cols: {} }));
    r.cols[e.col] = e.hlc;
  }
  const out: PackedClocks = {};
  for (const { tbl, id, cols } of byRow.values()) {
    const counts = new Map<Clock, number>();
    for (const c of Object.values(cols)) counts.set(c, (counts.get(c) ?? 0) + 1);
    const base = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    const packed: { _: Clock; [col: string]: Clock } = { _: base };
    for (const [col, c] of Object.entries(cols)) if (c !== base) packed[col] = c;
    (out[tbl] ??= {})[id] = packed;
  }
  return out;
}

/** The clocks of one row from a backup file: the row's own entries, its base for the rest, or none. */
export function unpackRow(packed: PackedClocks | undefined, tbl: string, row: Row): Record<string, Clock> {
  const p = packed?.[tbl]?.[row.id];
  if (!p) return {};
  const out: Record<string, Clock> = {};
  for (const col of Object.keys(row)) if (!NOT_A_FIELD.has(col)) out[col] = p[col] ?? p._;
  return out;
}

/**
 * Only the columns this phone's table has. A phone on a newer app version may send a column added
 * after this one's version (written as "no such column" otherwise, failing every sync until it updates);
 * it's skipped here and read again from the snapshots once this phone updates (see migrate()).
 */
export function knownColumns(row: Row, columns: Set<string>): Row {
  const out: Row = { id: row.id, updated_at: row.updated_at };
  for (const [k, v] of Object.entries(row)) if (columns.has(k)) out[k] = v;
  return out;
}
