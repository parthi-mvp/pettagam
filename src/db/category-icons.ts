import type { SQLiteDatabase } from 'expo-sqlite';

import { canonicalCategoryIcon } from '@/components/icons';

import { save } from './repo';
import type { Category } from './types';

/**
 * Bring every category's stored icon onto the one icon set (Material Symbols by its shown name, or an
 * emoji): old drawn names ("coffee"), aliases ("ms:local_grocery_store") and empty icons are rewritten
 * through save(), so the fix syncs to the account and other phones. Rows already right are left alone,
 * so after the first run this writes nothing. Runs at start-up; also catches old values another phone
 * on an older version uploads later.
 */
export async function normalizeCategoryIcons(db: SQLiteDatabase): Promise<number> {
  const rows = await db.getAllAsync<Category>('SELECT * FROM categories WHERE deleted = 0');
  let changed = 0;
  for (const { created_at: _c, updated_at: _u, deleted: _d, ...row } of rows) {
    const icon = canonicalCategoryIcon(row.name, row.kind, row.icon);
    if (icon === row.icon) continue;
    await save(db, 'categories', { ...row, icon }, { silent: true });
    changed++;
  }
  return changed;
}
