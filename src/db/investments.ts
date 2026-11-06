import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { holding, type Holding } from '@/lib/holding';
import { compoundingOf, parseDetails, usesUnits, type ChitDetails, type PriceLink } from '@/lib/invest';

import { emitChange } from './events';
import { getById, getSetting, listInvestmentEntries, listInvestments, save, setSetting, softDelete } from './repo';
import { seedCategoryId } from './schema';
import type { Investment, InvestmentEntry, InvestmentEntryKind, Transaction } from './types';

/**
 * Investments and the money behind them. An investment's invested amount, units and value are always
 * worked out from its entries (src/lib/holding.ts), never edited in place. An entry can name the
 * account the money came from or went into; it then has a transaction in that account:
 *  - buy / SIP:            a transfer from the account to the investment (not spending)
 *  - sell / payout:        a transfer from the investment into the account (not income)
 *  - dividend / interest:  income, "Interest & Dividends"
 * The transaction's other side is the investment's id, which matches no account, so only the real
 * account's balance moves. Its source is 'investment'; edit it from the investment, not the entry list.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const OUT_KINDS: InvestmentEntryKind[] = ['buy', 'contribution'];
const INCOME_KINDS: InvestmentEntryKind[] = ['dividend', 'interest'];

export function holdingOf(inv: Investment, entries: InvestmentEntry[], now = Date.now()): Holding {
  const link = parseDetails<PriceLink>(inv);
  return holding(entries, {
    units: usesUnits(inv.type),
    rate: inv.interest_rate,
    compounding: compoundingOf(inv.type) ?? undefined,
    maturity: inv.maturity_date,
    live: link.livePrice && link.livePriceAt ? { price: link.livePrice, at: link.livePriceAt } : null,
    now,
  });
}

/** Write an investment's invested amount, units and value from its entries. */
export async function recomputeInvested(db: SQLiteDatabase, investmentId: string) {
  const inv = await getById(db, 'investments', investmentId);
  if (!inv) return;
  const entries = await listInvestmentEntries(db, investmentId);
  const { id: _id, created_at: _c, updated_at: _u, deleted: _d, ...rest } = inv;
  if (inv.type === 'chit') {
    // A chit prize isn't a withdrawal of what you put in: invested = installments paid. Once prized the
    // pot has been paid out, so the chit itself holds nothing; what you still owe is counted in net worth.
    const paid = entries.filter((e) => e.kind === 'buy' || e.kind === 'contribution').reduce((s, e) => s + e.amount, 0);
    const prized = entries.some((e) => e.kind === 'payout') || parseDetails<ChitDetails>(inv).wonMonth != null;
    await save(db, 'investments', { ...rest, id: investmentId, invested_amount: paid, current_value: prized ? 0 : paid });
    return;
  }
  const h = holdingOf(inv, entries);
  await save(db, 'investments', {
    ...rest,
    id: investmentId,
    invested_amount: r2(h.invested),
    // Interest estimates to the rupee, so a day's growth doesn't rewrite it every few minutes.
    current_value: h.basis === 'rate' ? Math.round(h.value) : r2(h.value),
    quantity: h.units ?? inv.quantity,
  });
}

export type EntryInput = {
  id?: string;
  kind: InvestmentEntryKind;
  date: number;
  amount: number;
  units: number | null;
  note: string | null;
  /** Paid from / received in; null = not recorded in an account. */
  accountId: string | null;
};

/** The account-side transaction for an entry, merged over an existing one (an imported SMS keeps its hash and details). */
function txnFor(inv: Investment, e: EntryInput, existing: Transaction | null) {
  const base = {
    amount: e.amount,
    date: e.date,
    merchant: existing?.merchant ?? inv.name,
    note: e.note ?? existing?.note ?? null,
    source: existing?.source === 'sms' || existing?.sms_hash ? ('sms' as const) : ('investment' as const),
    sms_hash: existing?.sms_hash ?? null,
    tags: existing?.tags ?? null,
    via: existing?.via ?? null,
  };
  if (INCOME_KINDS.includes(e.kind)) return { ...base, type: 'income' as const, account_id: e.accountId!, to_account_id: inv.id, category_id: seedCategoryId('Interest & Dividends') };
  if (OUT_KINDS.includes(e.kind)) return { ...base, type: 'transfer' as const, account_id: e.accountId!, to_account_id: inv.id, category_id: null };
  return { ...base, type: 'transfer' as const, account_id: inv.id, to_account_id: e.accountId!, category_id: null };
}

/** Add or change an entry, keep its account transaction in step, and update the investment. */
export async function saveEntry(db: SQLiteDatabase, inv: Investment, e: EntryInput, linkTxn?: string) {
  const id = e.id ?? Crypto.randomUUID();
  const prev = e.id ? await getById(db, 'investment_entries', e.id) : null;
  const txnId = linkTxn ?? prev?.txn_id ?? null;
  const withAccount = e.accountId && e.kind !== 'valuation';
  const tid = withAccount ? (txnId ?? `inv-${id}`) : null;
  if (withAccount) {
    const existing = await getById(db, 'transactions', tid!);
    await save(db, 'transactions', { id: tid!, ...txnFor(inv, e, existing) });
  } else if (txnId) await unlinkTxn(db, txnId);
  await save(db, 'investment_entries', {
    id,
    investment_id: inv.id,
    kind: e.kind,
    date: e.date,
    amount: e.amount,
    units: e.units,
    note: e.note,
    account_id: withAccount ? e.accountId : null,
    txn_id: tid,
  });
  await recomputeInvested(db, inv.id);
  return id;
}

/**
 * An entry's transaction, no longer an investment's. One we created goes; an imported bank SMS stays
 * (the money did move), back to a plain expense or income, so it's never imported twice.
 */
async function unlinkTxn(db: SQLiteDatabase, txnId: string) {
  const t = await getById(db, 'transactions', txnId);
  if (!t) return;
  if (!t.sms_hash) return softDelete(db, 'transactions', txnId);
  const intoAccount = await getById(db, 'accounts', t.to_account_id ?? '');
  const { id: _i, created_at: _c, updated_at: _u, deleted: _d, ...rest } = t;
  await save(db, 'transactions', {
    ...rest,
    id: t.id,
    type: t.type === 'income' || intoAccount ? 'income' : 'expense',
    account_id: intoAccount ? intoAccount.id : t.account_id,
    to_account_id: null,
    category_id: null,
    source: 'sms',
  });
}

export async function deleteEntry(db: SQLiteDatabase, entry: InvestmentEntry) {
  if (entry.txn_id) await unlinkTxn(db, entry.txn_id);
  await softDelete(db, 'investment_entries', entry.id);
  await recomputeInvested(db, entry.investment_id);
}

/**
 * "This is an investment": turn an existing transaction (say, a SIP debit from bank SMS) into an entry
 * of `inv`. The transaction stays (same id, so its SMS is never imported again), now a transfer.
 */
export async function linkTransaction(db: SQLiteDatabase, txnId: string, inv: Investment, kind: InvestmentEntryKind, units: number | null) {
  const t = await getById(db, 'transactions', txnId);
  if (!t) return;
  // The account the money moved in: for money coming back (sell, payout, income) it's the receiving one.
  const accountId = t.to_account_id && (await getById(db, 'accounts', t.to_account_id)) ? t.to_account_id : t.account_id;
  await saveEntry(db, inv, { kind, date: t.date, amount: t.amount, units, note: t.note, accountId }, txnId);
}

/** The investment entry a transaction belongs to, if any. */
export const entryForTxn = (db: SQLiteDatabase, txnId: string) =>
  db.getFirstAsync<InvestmentEntry>('SELECT * FROM investment_entries WHERE deleted = 0 AND txn_id = ?', [txnId]);

/** Delete an investment with its entries. Account transactions stay (the money did move), as plain transfers. */
export async function deleteInvestment(db: SQLiteDatabase, inv: Investment) {
  await softDelete(db, 'investments', inv.id);
}

/**
 * Bring every investment's value up to date: interest estimates grow by the day, prices change.
 * Once per install, a value typed in earlier (before values came from entries) is kept as a valuation.
 */
export async function refreshInvestments(db: SQLiteDatabase) {
  const keep = (await getSetting(db, 'inv_values_v1')) == null;
  for (const inv of await listInvestments(db)) {
    if (inv.type === 'chit') continue;
    if (keep) {
      const entries = await listInvestmentEntries(db, inv.id);
      const h = holdingOf(inv, entries);
      if (!entries.some((e) => e.kind === 'valuation') && h.basis !== 'rate' && Math.abs(h.value - inv.current_value) >= 1) {
        await save(db, 'investment_entries', {
          investment_id: inv.id,
          kind: 'valuation',
          date: inv.updated_at,
          amount: inv.current_value,
          units: usesUnits(inv.type) ? (h.units ?? inv.quantity) : null,
          note: null,
        });
      }
    }
    await recomputeInvested(db, inv.id);
  }
  if (keep) await setSetting(db, 'inv_values_v1', '1');
  emitChange('investments');
}
