import type { SQLiteDatabase } from 'expo-sqlite';

import type { Transaction } from '@/db/types';
import { money } from '@/lib/format';

import { listBudgets, monthSpend } from './queries';
import { crossed } from './status';

/**
 * After an expense is saved: did it push a budget past 80% or over? Only the save that crosses a
 * line says so (not every save after it). A category budget wins over the overall one.
 */
export async function budgetAlert(
  db: SQLiteDatabase,
  date: number,
  categoryId: string | null,
  previous: Transaction | null,
  amount: number
): Promise<{ kind: 'near' | 'over'; text: string } | null> {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const budgets = await listBudgets(db);
  if (!budgets.length) return null;
  const spend = await monthSpend(db, start, end);
  // What this save added: the new amount, minus the old one when an expense in the same month and
  // category was only edited.
  const samePlace = (cat: string | null) =>
    previous && previous.type === 'expense' && previous.date >= start && previous.date < end && (cat === null || previous.category_id === cat);
  const added = (cat: string | null) => amount - (samePlace(cat) ? previous!.amount : 0);

  const cat = categoryId ? budgets.find((b) => b.category_id === categoryId) : undefined;
  if (cat) {
    const after = spend.byCategory.get(categoryId) ?? 0;
    const hit = crossed(cat.amount, after - added(categoryId), after);
    if (hit) {
      const name = (await db.getFirstAsync<{ name: string }>('SELECT name FROM categories WHERE id = ?', [categoryId]))?.name ?? 'This category';
      return { kind: hit, text: hit === 'over' ? `${name} is ${money(after - cat.amount)} over budget` : `You’ve used ${Math.round((after / cat.amount) * 100)}% of ${name}` };
    }
  }
  const overall = budgets.find((b) => b.category_id === null);
  if (overall) {
    const hit = crossed(overall.amount, spend.total - added(null), spend.total);
    if (hit) {
      return {
        kind: hit,
        text: hit === 'over' ? `${money(spend.total - overall.amount)} over your monthly budget` : `You’ve used ${Math.round((spend.total / overall.amount) * 100)}% of your monthly budget`,
      };
    }
  }
  return null;
}
