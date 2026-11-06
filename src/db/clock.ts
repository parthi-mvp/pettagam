import type { SQLiteDatabase } from 'expo-sqlite';

import { observe, tick, type Clock } from '@/sync/crdt';

import { getSetting, setSetting } from './repo';

/** A stable id for this install: names its backup files and ends each of its clocks. */
export async function deviceId(db: SQLiteDatabase) {
  let id = await getSetting(db, 'device_id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    await setSetting(db, 'device_id', id);
  }
  return id;
}

/** The clock for a local edit (stored, so the next one is always later). */
export async function nextClock(db: SQLiteDatabase): Promise<Clock> {
  const c = tick(await getSetting(db, 'hlc_last'), Date.now(), await deviceId(db));
  await setSetting(db, 'hlc_last', c);
  return c;
}

/** After merging other phones' edits: move this phone's clock past the newest one seen. */
export async function observeClock(db: SQLiteDatabase, remote: Clock) {
  const last = await getSetting(db, 'hlc_last');
  if (last && last >= remote) return;
  await setSetting(db, 'hlc_last', observe(last, remote, Date.now(), await deviceId(db)));
}

/** Record that these columns of a row were written at `clock`. */
export async function stampFields(db: SQLiteDatabase, tbl: string, rowId: string, cols: string[], clock: Clock) {
  for (const col of cols) {
    await db.runAsync('INSERT INTO field_clock (tbl, row_id, col, hlc) VALUES (?, ?, ?, ?) ON CONFLICT(tbl, row_id, col) DO UPDATE SET hlc = excluded.hlc', [
      tbl,
      rowId,
      col,
      clock,
    ]);
  }
}
