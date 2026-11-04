import type { SQLiteDatabase } from 'expo-sqlite';

import type { Budget, Category } from '@/db/types';
import { monthRange } from '@/lib/format';

import { budgetStatus, type BudgetStatus } from './status';

export type CategoryBudget = { budget: Budget; category: Category | null; status: BudgetStatus };
export type BudgetOverview = {
  overall: { budget: Budget; status: BudgetStatus } | null;
  categories: CategoryBudget[];
  /** All expense spending in the month (with or without a budget). */
  spent: number;
};

/** Expenses only: transfers (card bills, ATM to Cash) and income never count against a budget. */
export async function monthSpend(db: SQLiteDatabase, start: number, end: number) {
  const rows = await db.getAllAsync<{ category_id: string | null; total: number }>(
    `SELECT category_id, SUM(amount) AS total FROM transactions
     WHERE deleted = 0 AND type = 'expense' AND date >= ? AND date < ? GROUP BY category_id`,
    [start, end]
  );
  return { byCategory: new Map(rows.map((r) => [r.category_id, r.total])), total: rows.reduce((s, r) => s + r.total, 0) };
}

export const listBudgets = (db: SQLiteDatabase) => db.getAllAsync<Budget>('SELECT * FROM budgets WHERE deleted = 0');

const RISK = { over: 0, near: 1, ok: 2 } as const;

/** Every budget for the month with its status; categories most at risk first. */
export async function budgetOverview(db: SQLiteDatabase, start: number, end: number, now = Date.now()): Promise<BudgetOverview> {
  const [budgets, spend, categories] = await Promise.all([
    listBudgets(db),
    monthSpend(db, start, end),
    db.getAllAsync<Category>('SELECT * FROM categories'),
  ]);
  const overallBudget = budgets.find((b) => b.category_id === null) ?? null;
  const categories_ = budgets
    .filter((b) => b.category_id !== null)
    .map((b) => ({
      budget: b,
      category: categories.find((c) => c.id === b.category_id) ?? null,
      status: budgetStatus(b.amount, spend.byCategory.get(b.category_id) ?? 0, start, end, now),
    }))
    .filter((x) => x.category && !x.category.deleted)
    .sort((a, b) => RISK[a.status.state] - RISK[b.status.state] || b.status.used - a.status.used);
  return {
    overall: overallBudget ? { budget: overallBudget, status: budgetStatus(overallBudget.amount, spend.total, start, end, now) } : null,
    categories: categories_,
    spent: spend.total,
  };
}

/** Average monthly spend per expense category over the last `months` full months (for suggestions and hints). */
export async function averageSpend(db: SQLiteDatabase, months = 3) {
  const from = monthRange(-months).start;
  const to = monthRange(0).start;
  const rows = await db.getAllAsync<{ category_id: string | null; total: number }>(
    `SELECT category_id, SUM(amount) AS total FROM transactions
     WHERE deleted = 0 AND type = 'expense' AND date >= ? AND date < ? GROUP BY category_id`,
    [from, to]
  );
  const byCategory = new Map(rows.map((r) => [r.category_id, r.total / months]));
  return { byCategory, total: rows.reduce((s, r) => s + r.total, 0) / months };
}

/** Friendly round number for a suggested budget: up to the next ₹500 (₹100 under ₹2,000). */
export const roundBudget = (n: number) => {
  const step = n < 2000 ? 100 : 500;
  return Math.max(step, Math.ceil(n / step) * step);
};
