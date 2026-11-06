import type { SQLiteDatabase } from 'expo-sqlite';

import { pickKeeper } from '@/sync/crdt';

import { patchTransactions, save, smsTransactionId, softDelete } from './repo';
import type { Budget, Category } from './types';

type Keyed = { id: string; created_at: number };

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Merge duplicates that two phones made of the same thing before ids were shared: the same SMS
 * imported twice, or a category with the same kind and name. Entries and budgets move to the copy
 * kept; the others are deleted (softly, so the clean-up syncs). Runs at start-up and after each sync;
 * finds nothing almost always.
 */
export async function mergeDuplicates(db: SQLiteDatabase): Promise<number> {
  let merged = 0;

  // The same SMS imported on two phones.
  const twins = await db.getAllAsync<{ sms_hash: string }>(
    'SELECT sms_hash FROM transactions WHERE deleted = 0 AND sms_hash IS NOT NULL GROUP BY sms_hash HAVING COUNT(*) > 1'
  );
  for (const { sms_hash } of twins) {
    const rows = await db.getAllAsync<Keyed>('SELECT id, created_at FROM transactions WHERE deleted = 0 AND sms_hash = ?', [sms_hash]);
    const keep = pickKeeper(rows, smsTransactionId(sms_hash));
    for (const r of rows) if (r.id !== keep.id) await softDelete(db, 'transactions', r.id);
    merged += rows.length - 1;
  }

  // The same category (kind + name, any case) created on two phones.
  const groups = await db.getAllAsync<{ kind: Category['kind']; key: string }>(
    "SELECT kind, lower(trim(name)) AS key FROM categories WHERE deleted = 0 GROUP BY kind, lower(trim(name)) HAVING COUNT(*) > 1"
  );
  for (const g of groups) {
    const rows = await db.getAllAsync<Category>('SELECT * FROM categories WHERE deleted = 0 AND kind = ? AND lower(trim(name)) = ?', [g.kind, g.key]);
    const s = slug(g.key);
    const keep = pickKeeper(rows, s ? (g.kind === 'income' && !rows.some((r) => r.id === `cat-${s}`) ? `cat-in-${s}` : `cat-${s}`) : null);
    for (const dup of rows) {
      if (dup.id === keep.id) continue;
      await patchTransactions(db, 'category_id = ?', [dup.id], { category_id: keep.id });
      const keepBudget = await db.getFirstAsync('SELECT 1 FROM budgets WHERE deleted = 0 AND category_id = ?', [keep.id]);
      for (const { created_at: _c, updated_at: _u, deleted: _d, ...b } of await db.getAllAsync<Budget>('SELECT * FROM budgets WHERE deleted = 0 AND category_id = ?', [
        dup.id,
      ])) {
        if (keepBudget) await softDelete(db, 'budgets', b.id);
        else await save(db, 'budgets', { ...b, category_id: keep.id }, { silent: true });
      }
      await softDelete(db, 'categories', dup.id);
      merged++;
    }
  }
  return merged;
}
