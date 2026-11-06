import type { SQLiteDatabase } from 'expo-sqlite';

import { observeClock, stampFields } from '@/db/clock';
import { upsertRaw } from '@/db/repo';
import { SYNCED_TABLES } from '@/db/types';

import { knownColumns, mergeRow, packClocks, unpackRow, type Clock, type PackedClocks, type Row } from './crdt';

/**
 * This phone's data as one object: a snapshot (every row, soft-deleted ones included) or a change
 * file (only changed fields of changed rows), each with its columns' clocks. Drive sync and backup
 * files both use it, and both restore through mergeIn.
 */
export type Snapshot = { kind: 'snapshot' | 'changes'; exportedAt: number; deviceId: string; tables: Record<string, Row[]>; clocks: PackedClocks };

export async function buildSnapshot(db: SQLiteDatabase, device: string): Promise<Snapshot> {
  const tables: Record<string, Row[]> = {};
  for (const t of SYNCED_TABLES) tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
  const clocks = packClocks(await db.getAllAsync<{ tbl: string; row_id: string; col: string; hlc: Clock }>('SELECT tbl, row_id, col, hlc FROM field_clock'));
  return { kind: 'snapshot', exportedAt: Date.now(), deviceId: device, tables, clocks };
}

export const isSnapshot = (x: unknown): x is Snapshot =>
  !!x && typeof x === 'object' && ((x as Snapshot).kind === 'snapshot' || (x as Snapshot).kind === 'changes') && typeof (x as Snapshot).tables === 'object';

/** How much a snapshot holds (live rows), for "1,240 entries · 12 accounts" before a restore. */
export function snapshotCounts(s: Snapshot) {
  const live = (t: string) => (s.tables[t] ?? []).filter((r) => !r.deleted).length;
  return { transactions: live('transactions'), accounts: live('accounts'), investments: live('investments'), budgets: live('budgets') };
}

/** Merge a snapshot or change file in, field by field (newest clock wins). Returns how many rows changed here. */
export async function mergeIn(db: SQLiteDatabase, snap: Snapshot) {
  let changed = 0;
  let newest: Clock | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const table of SYNCED_TABLES) {
      const remoteRows = snap.tables[table];
      if (!remoteRows?.length) continue;
      const localRows = new Map((await txn.getAllAsync<Row>(`SELECT * FROM ${table}`)).map((r) => [r.id, r]));
      const columns = new Set((await txn.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name));
      const localClocks = new Map<string, Record<string, Clock>>();
      for (const c of await txn.getAllAsync<{ row_id: string; col: string; hlc: Clock }>('SELECT row_id, col, hlc FROM field_clock WHERE tbl = ?', [table])) {
        (localClocks.get(c.row_id) ?? localClocks.set(c.row_id, {}).get(c.row_id)!)[c.col] = c.hlc;
      }
      for (const sent of remoteRows) {
        const remote = knownColumns(sent, columns);
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

