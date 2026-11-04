import * as Crypto from 'expo-crypto';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { parseDetails, type ChitDetails } from '@/lib/invest';

import { emitChange } from './events';
import type {
  Account,
  AccountType,
  Budget,
  Category,
  Investment,
  InvestmentEntry,
  SyncedRow,
  TableName,
  Transaction,
} from './types';
import { balanceOf } from './types';

type RowOf<T extends TableName> = T extends 'accounts'
  ? Account
  : T extends 'categories'
    ? Category
    : T extends 'transactions'
      ? Transaction
      : T extends 'investments'
        ? Investment
        : T extends 'budgets'
          ? Budget
          : InvestmentEntry;

export type NewRow<T extends TableName> = Omit<RowOf<T>, keyof SyncedRow> & Partial<Pick<SyncedRow, 'id'>>;

/** Insert or update a row; stamps updated_at so the change wins on the next sync. */
export async function save<T extends TableName>(
  db: SQLiteDatabase,
  table: T,
  data: NewRow<T>,
  opts: { silent?: boolean } = {}
): Promise<string> {
  const now = Date.now();
  const id = data.id ?? Crypto.randomUUID();
  const existing = await db.getFirstAsync<{ created_at: number }>(`SELECT created_at FROM ${table} WHERE id = ?`, [id]);
  const row: Record<string, unknown> = {
    ...data,
    id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    deleted: 0,
  };
  await upsertRaw(db, table, row);
  await enqueue(db, table, id);
  if (!opts.silent) emitChange(table);
  return id;
}

/** Queue a row for upload to Neon. Called for every local edit (not for rows pulled from the server). */
export async function enqueue(db: SQLiteDatabase, table: TableName, id: string) {
  await db.runAsync('INSERT OR REPLACE INTO outbox (table_name, row_id) VALUES (?, ?)', [table, id]);
}

/** Write a row exactly as given (used by sync merge — keeps the remote updated_at). */
export async function upsertRaw(db: SQLiteDatabase, table: TableName, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
    cols.map((c) => (row[c] ?? null) as SQLiteBindValue)
  );
}

export async function softDelete(db: SQLiteDatabase, table: TableName, id: string) {
  await db.runAsync(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`, [Date.now(), id]);
  await enqueue(db, table, id);
  if (table === 'investments') {
    const entries = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM investment_entries WHERE investment_id = ? AND deleted = 0',
      [id]
    );
    await db.runAsync('UPDATE investment_entries SET deleted = 1, updated_at = ? WHERE investment_id = ?', [
      Date.now(),
      id,
    ]);
    for (const e of entries) await enqueue(db, 'investment_entries', e.id);
  }
  emitChange(table);
}

export const getById = <T extends TableName>(db: SQLiteDatabase, table: T, id: string) =>
  db.getFirstAsync<RowOf<T>>(`SELECT * FROM ${table} WHERE id = ? AND deleted = 0`, [id]);

export const listAccounts = (db: SQLiteDatabase) =>
  db.getAllAsync<Account>('SELECT * FROM accounts WHERE deleted = 0 ORDER BY type, name');

export const listCategories = (db: SQLiteDatabase) =>
  db.getAllAsync<Category>('SELECT * FROM categories WHERE deleted = 0 ORDER BY kind, name');

export const listInvestments = (db: SQLiteDatabase) =>
  db.getAllAsync<Investment>('SELECT * FROM investments WHERE deleted = 0 ORDER BY type, name');

export const listInvestmentEntries = (db: SQLiteDatabase, investmentId: string) =>
  db.getAllAsync<InvestmentEntry>(
    'SELECT * FROM investment_entries WHERE deleted = 0 AND investment_id = ? ORDER BY date DESC',
    [investmentId]
  );

export type TxnRow = Transaction & {
  account_name: string;
  to_account_name: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
};

export function listTransactions(
  db: SQLiteDatabase,
  f: { from?: number; to?: number; accountId?: string; search?: string; limit?: number } = {}
) {
  const where = ['t.deleted = 0'];
  const params: SQLiteBindValue[] = [];
  if (f.from != null) {
    where.push('t.date >= ?');
    params.push(f.from);
  }
  if (f.to != null) {
    where.push('t.date < ?');
    params.push(f.to);
  }
  if (f.accountId) {
    where.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(f.accountId, f.accountId);
  }
  if (f.search) {
    where.push('(t.merchant LIKE ? OR t.note LIKE ? OR c.name LIKE ?)');
    const q = `%${f.search}%`;
    params.push(q, q, q);
  }
  params.push(f.limit ?? 500);
  return db.getAllAsync<TxnRow>(
    `SELECT t.*, a.name AS account_name, ta.name AS to_account_name, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     LEFT JOIN accounts ta ON ta.id = t.to_account_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.date DESC LIMIT ?`,
    params
  );
}

/**
 * Balance per account.
 * Asset accounts (bank/cash/wallet): opening + income − expense − transfers out + transfers in.
 * Liability accounts (credit card/loan): outstanding = opening + spends − payments received.
 */
export async function accountBalances(db: SQLiteDatabase): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ id: string; type: AccountType; opening_balance: number; flow: number }>(
    `SELECT a.id, a.type, a.opening_balance,
       COALESCE((SELECT SUM(CASE
          WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount
          WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
          WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
          WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
          ELSE 0 END)
        FROM transactions t WHERE t.deleted = 0 AND (t.account_id = a.id OR t.to_account_id = a.id)), 0) AS flow
     FROM accounts a WHERE a.deleted = 0`
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.id] = balanceOf(r.type, r.opening_balance, r.flow);
  }
  return out;
}

/** Recompute an investment's invested_amount from its entries (buys/contributions − sells/payouts). */
export async function recomputeInvested(db: SQLiteDatabase, investmentId: string) {
  const r = await db.getFirstAsync<{ invested: number; units: number | null; hasUnits: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN kind IN ('buy','contribution') THEN amount WHEN kind IN ('sell','payout') THEN -amount ELSE 0 END), 0) AS invested,
       SUM(CASE WHEN kind = 'buy' THEN COALESCE(units,0) WHEN kind = 'sell' THEN -COALESCE(units,0) ELSE 0 END) AS units,
       COUNT(units) AS hasUnits
     FROM investment_entries WHERE deleted = 0 AND investment_id = ?`,
    [investmentId]
  );
  if (!r) return;
  const inv = await getById(db, 'investments', investmentId);
  if (!inv) return;
  const { id: _id, created_at: _c, updated_at: _u, deleted: _d, ...rest } = inv;
  if (inv.type === 'chit') {
    // A chit prize isn't a withdrawal of what you put in: invested = installments paid. Once prized the
    // pot has been paid out, so the chit itself holds nothing; what you still owe is counted in net worth.
    const c = await db.getFirstAsync<{ paid: number; prize: number }>(
      `SELECT COALESCE(SUM(CASE WHEN kind IN ('buy','contribution') THEN amount END), 0) AS paid,
              COALESCE(SUM(CASE WHEN kind = 'payout' THEN amount END), 0) AS prize
       FROM investment_entries WHERE deleted = 0 AND investment_id = ?`,
      [investmentId]
    );
    const prized = (c?.prize ?? 0) > 0 || parseDetails<ChitDetails>(inv).wonMonth != null;
    await save(db, 'investments', { ...rest, id: investmentId, invested_amount: c?.paid ?? 0, current_value: prized ? 0 : (c?.paid ?? 0) });
    return;
  }
  await save(db, 'investments', {
    ...rest,
    id: investmentId,
    invested_amount: r.invested,
    quantity: r.hasUnits > 0 ? r.units : inv.quantity,
  });
}

export async function getSetting(db: SQLiteDatabase, key: string) {
  const r = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string | null) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

/** Patch every live transaction matching `where` through save(), so each change is stamped and synced. */
export async function patchTransactions(db: SQLiteDatabase, where: string, params: SQLiteBindValue[], patch: Partial<NewRow<'transactions'>>) {
  const rows = await db.getAllAsync<Transaction>(`SELECT * FROM transactions WHERE deleted = 0 AND (${where})`, params);
  for (const { created_at: _c, updated_at: _u, deleted: _d, ...row } of rows) await save(db, 'transactions', { ...row, ...patch }, { silent: true });
  if (rows.length) emitChange('transactions');
  return rows.length;
}
