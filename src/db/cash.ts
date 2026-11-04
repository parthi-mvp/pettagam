import type { SQLiteDatabase } from 'expo-sqlite';

import { save } from './repo';

/** Fixed id: two phones creating the default Cash account make the same row, so sync merges it. */
export const CASH_ACCOUNT_ID = 'acc-cash';

/**
 * The user's Cash account (an existing one of type cash is reused), created if they have none.
 * Returns null when the default was deleted on purpose and `need` is false: sync won't bring it
 * back; only importing an ATM withdrawal (which needs somewhere to go) does.
 */
export async function ensureCashAccount(db: SQLiteDatabase, need = true): Promise<string | null> {
  const found = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM accounts WHERE type = 'cash' AND deleted = 0 ORDER BY id = ? DESC, created_at LIMIT 1",
    [CASH_ACCOUNT_ID]
  );
  if (found) return found.id;
  if (!need && (await db.getFirstAsync('SELECT 1 FROM accounts WHERE id = ?', [CASH_ACCOUNT_ID]))) return null;
  return save(db, 'accounts', {
    id: CASH_ACCOUNT_ID,
    type: 'cash',
    name: 'Cash',
    institution: null,
    last4: null,
    card_last4: null,
    opening_balance: 0,
    credit_limit: null,
    billing_day: null,
    notes: null,
  });
}
