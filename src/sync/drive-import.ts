import type { SQLiteDatabase } from 'expo-sqlite';

import { emitChange } from '@/db/events';
import { enqueue, upsertRaw } from '@/db/repo';
import { SYNCED_TABLES } from '@/db/types';

import { downloadSnapshot, signIn as googleSignIn } from './drive';
import { mergeTable, type Row, type Snapshot } from './merge';

/**
 * One-time migration from the old Google Drive sync: download the Drive snapshot, keep the newer
 * copy of each row, and queue everything that changed for upload to Neon.
 * Kept for one release, then this file, drive.ts and merge.ts can be removed.
 */
export async function importFromDrive(db: SQLiteDatabase): Promise<number> {
  const email = await googleSignIn();
  if (!email) return 0;
  const { data } = await downloadSnapshot<Snapshot>();
  if (!data || data.format !== 1) return 0;
  let imported = 0;
  for (const table of SYNCED_TABLES) {
    const local = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
    const { toApplyLocally } = mergeTable(local, data.tables[table] ?? []);
    for (const row of toApplyLocally) {
      await upsertRaw(db, table, row);
      await enqueue(db, table, row.id);
      imported++;
    }
  }
  emitChange('*');
  return imported;
}
