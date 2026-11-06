import type { SQLiteDatabase } from 'expo-sqlite';

import { accountBalances, listAccounts, listInvestments } from '@/db/repo';
import { chitPlan, chitSummary, type CashEntry } from '@/lib/chit';
import { parseDetails } from '@/lib/invest';
import { parseTags } from '@/lib/tags';
import { INVESTMENT_TYPE_LABELS, isCardLike, isLiability, type InvestmentType } from '@/db/types';
import { money, monthLabel, monthRange } from '@/lib/format';
import { cardCycles, type Cycle } from '@/lib/card-cycle';

import { findRecurring, type Payment } from './recurring';
import type { ExportRow } from './statement';

export type CategorySlice = { id: string | null; name: string; color: string; icon: string | null; total: number };
export type MonthPoint = { label: string; start: number; income: number; expense: number };

export async function categoryBreakdown(db: SQLiteDatabase, from: number, to: number, kind: 'expense' | 'income' = 'expense') {
  return db.getAllAsync<CategorySlice>(
    `SELECT t.category_id AS id, COALESCE(c.name, 'Uncategorised') AS name, COALESCE(c.color, '#8E8E93') AS color, c.icon AS icon,
            SUM(t.amount) AS total
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.deleted = 0 AND t.type = ? AND t.date >= ? AND t.date < ?
     GROUP BY t.category_id ORDER BY total DESC`,
    [kind, from, to]
  );
}

/** Spending in a period by how it was paid (UPI, card, bank transfer…); via null = not recorded (hand-made entries). */
export const paymentMethods = (db: SQLiteDatabase, from: number, to: number) =>
  db.getAllAsync<{ via: string | null; total: number; count: number }>(
    `SELECT via, SUM(amount) AS total, COUNT(*) AS count FROM transactions
     WHERE deleted = 0 AND type = 'expense' AND date >= ? AND date < ?
     GROUP BY via ORDER BY total DESC`,
    [from, to]
  );

export type SpendPace = {
  /** Days in this month, and today's 0-based index in it. */
  days: number;
  today: number;
  /** Running total of spending, day by day: this month up to today, last month in full. */
  current: number[];
  previous: number[];
  previousLabel: string;
};

/** Expense per day of a month, as a running total (index 0 = the 1st). */
async function runningSpend(db: SQLiteDatabase, start: number, end: number, upto: number) {
  const rows = await db.getAllAsync<{ d: number; total: number }>(
    `SELECT CAST((date - ?) / 86400000 AS INTEGER) AS d, SUM(amount) AS total FROM transactions
     WHERE deleted = 0 AND type = 'expense' AND date >= ? AND date < ? GROUP BY d`,
    [start, start, end]
  );
  const perDay = new Array<number>(upto).fill(0);
  for (const r of rows) if (r.d >= 0 && r.d < upto) perDay[r.d] += r.total;
  let sum = 0;
  return perDay.map((v) => (sum += v));
}

/** This month's spending pace against last month's, for the Home chart. */
export async function spendPace(db: SQLiteDatabase, now = new Date()): Promise<SpendPace> {
  const cur = monthRange(0, now);
  const prev = monthRange(-1, now);
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const prevDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const today = now.getDate() - 1;
  const [current, previous] = await Promise.all([runningSpend(db, cur.start, cur.end, today + 1), runningSpend(db, prev.start, prev.end, prevDays)]);
  return { days, today, current, previous, previousLabel: new Date(prev.start).toLocaleDateString('en-IN', { month: 'short' }) };
}

/** Money in and out per month for `months` months ending with the month of `base` (oldest first). */
export async function monthlyTrend(db: SQLiteDatabase, months = 6, base = new Date()): Promise<MonthPoint[]> {
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const { start, end } = monthRange(-i, base);
    const r = await db.getFirstAsync<{ income: number; expense: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense
       FROM transactions WHERE deleted = 0 AND date >= ? AND date < ?`,
      [start, end]
    );
    out.push({ label: monthLabel(start), start, income: r?.income ?? 0, expense: r?.expense ?? 0 });
  }
  return out;
}

export async function topMerchants(db: SQLiteDatabase, from: number, to: number, limit = 5) {
  return db.getAllAsync<{ merchant: string; total: number; count: number }>(
    `SELECT merchant, SUM(amount) AS total, COUNT(*) AS count FROM transactions
     WHERE deleted = 0 AND type = 'expense' AND merchant IS NOT NULL AND date >= ? AND date < ?
     GROUP BY LOWER(merchant) ORDER BY total DESC LIMIT ?`,
    [from, to, limit]
  );
}

export type NetWorth = {
  bank: number; // bank + cash + wallet
  creditCardDue: number;
  loans: number;
  investments: number;
  invested: number;
  net: number;
  bankCount: number; // bank + cash + wallet accounts
  chitDues: number; // installments still owed on chits you've already won
  chits: { id: string; name: string; summary: ReturnType<typeof chitSummary> }[];
  cards: { id: string; name: string; last4: string | null; due: number; limit: number | null; billingDay: number | null; dueDay: number | null }[];
  /** Loans with an EMI day: the next EMI. */
  emis: { id: string; name: string; emi: number | null; dueDay: number; outstanding: number }[];
  allocation: { type: InvestmentType; label: string; value: number; invested: number; count: number }[];
};

export async function netWorth(db: SQLiteDatabase): Promise<NetWorth> {
  const [accounts, balances, investments] = await Promise.all([listAccounts(db), accountBalances(db), listInvestments(db)]);
  let bank = 0,
    bankCount = 0,
    creditCardDue = 0,
    loans = 0;
  const cards: NetWorth['cards'] = [];
  const emis: NetWorth['emis'] = [];
  for (const a of accounts) {
    const b = balances[a.id] ?? 0;
    if (isCardLike(a.type)) {
      creditCardDue += b;
      cards.push({ id: a.id, name: a.name, last4: a.last4, due: b, limit: a.credit_limit, billingDay: a.billing_day, dueDay: a.due_day ?? null });
    } else if (a.type === 'loan' || a.type === 'borrowed') {
      loans += b;
      if (a.type === 'loan' && a.due_day && b > 0.5) emis.push({ id: a.id, name: a.name, emi: a.emi ?? null, dueDay: a.due_day, outstanding: b });
    }
    else if (!isLiability(a.type)) {
      bank += b;
      bankCount++;
    }
  }
  const byType = new Map<InvestmentType, { value: number; invested: number; count: number }>();
  let inv = 0,
    invested = 0;
  for (const i of investments) {
    inv += i.current_value;
    invested += i.invested_amount;
    const cur = byType.get(i.type) ?? { value: 0, invested: 0, count: 0 };
    cur.value += i.current_value;
    cur.invested += i.invested_amount;
    cur.count++;
    byType.set(i.type, cur);
  }
  const chits = await chitStatuses(db, investments);
  const chitDues = chits.reduce((sum, c) => sum + (c.summary.prized ? c.summary.remainingDues : 0), 0);
  // Chits have no market "gain"; their result is shown on the chit screen, so don't show a fake loss here.
  const chitCur = byType.get('chit');
  if (chitCur) chitCur.invested = chitCur.value;
  const allocation = [...byType.entries()]
    .map(([type, v]) => ({ type, label: INVESTMENT_TYPE_LABELS[type], ...v }))
    .sort((a, b) => b.value - a.value);
  return {
    bank,
    bankCount,
    creditCardDue,
    loans,
    investments: inv,
    invested,
    net: bank + inv - creditCardDue - loans - chitDues,
    chitDues,
    chits,
    cards,
    emis,
    allocation,
  };
}

/** Live status of every chit (paid, dividends, dues, next installment) from its entries. */
export async function chitStatuses(db: SQLiteDatabase, investments: Awaited<ReturnType<typeof listInvestments>>) {
  const chits = investments.filter((i) => i.type === 'chit');
  if (!chits.length) return [];
  const entries = await db.getAllAsync<CashEntry & { investment_id: string }>(
    `SELECT investment_id, kind, amount, date, units FROM investment_entries
     WHERE deleted = 0 AND investment_id IN (${chits.map(() => '?').join(', ')})`,
    chits.map((c) => c.id)
  );
  return chits.flatMap((inv) => {
    const plan = chitPlan(parseDetails(inv));
    if (!plan) return [];
    return [{ id: inv.id, name: inv.name, summary: chitSummary(plan, entries.filter((e) => e.investment_id === inv.id), inv.start_date) }];
  });
}

/** Plain-language observations for the Reports screen. */
export async function insights(db: SQLiteDatabase): Promise<string[]> {
  const out: string[] = [];
  const cur = monthRange(0);
  const prev = monthRange(-1);
  const [curCats, prevCats, trend, nw] = await Promise.all([
    categoryBreakdown(db, cur.start, cur.end),
    categoryBreakdown(db, prev.start, prev.end),
    monthlyTrend(db, 3),
    netWorth(db),
  ]);
  const thisMonth = trend[trend.length - 1];
  const lastMonth = trend[trend.length - 2];

  // Pace projection for the current month.
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (thisMonth.expense > 0 && day < daysInMonth) {
    const projected = (thisMonth.expense / day) * daysInMonth;
    out.push(`At this pace you'll spend about ${money(projected)} this month (last month: ${money(lastMonth.expense)}).`);
  }
  if (thisMonth.income > 0) {
    const rate = ((thisMonth.income - thisMonth.expense) / thisMonth.income) * 100;
    out.push(`Savings rate this month: ${rate.toFixed(0)}% of income.${rate < 20 ? ' Aim for 20%+.' : ''}`);
  }
  const prevMap = new Map(prevCats.map((c) => [c.name, c.total]));
  for (const c of curCats.slice(0, 5)) {
    const p = prevMap.get(c.name) ?? 0;
    if (p > 0 && c.total > p * 1.25 && c.total - p > 500) {
      out.push(`${c.name} is up ${(((c.total - p) / p) * 100).toFixed(0)}% vs last month (${money(c.total)} vs ${money(p)}).`);
    }
  }
  for (const card of nw.cards) {
    if (card.limit && card.limit > 0) {
      const u = (card.due / card.limit) * 100;
      if (u > 30) out.push(`${card.name} utilisation is ${u.toFixed(0)}%. Keeping it under 30% helps your credit score.`);
    }
  }
  if (nw.investments > 0 && nw.invested > 0) {
    const g = ((nw.investments - nw.invested) / nw.invested) * 100;
    out.push(`Investments: ${money(nw.investments)} on ${money(nw.invested)} invested (${g >= 0 ? '+' : ''}${g.toFixed(1)}%).`);
  }
  if (out.length === 0) out.push('Add a few transactions or import SMS to see insights here.');
  return out;
}

/** Every entry in [from, to), newest first, as plain rows for CSV / PDF export (src/reports/statement.ts). */
export async function exportRows(db: SQLiteDatabase, from: number, to: number): Promise<ExportRow[]> {
  const rows = await db.getAllAsync<Omit<ExportRow, 'tags'> & { tags: string | null }>(
    `SELECT date(t.date/1000,'unixepoch','localtime') AS date, t.type, t.amount, a.name AS account,
            ta.name AS to_account, c.name AS category, t.merchant, t.note, t.via, t.tags
     FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts ta ON ta.id=t.to_account_id
     LEFT JOIN categories c ON c.id=t.category_id WHERE t.deleted=0 AND t.date >= ? AND t.date < ? ORDER BY t.date DESC`,
    [from, to]
  );
  return rows.map((r) => ({ ...r, tags: parseTags(r.tags).join('; ') }));
}

/** Subscriptions, rent, EMIs and bills: steady payments to one merchant over the last 13 months. */
export async function recurringPayments(db: SQLiteDatabase, now = Date.now()) {
  const rows = await db.getAllAsync<Payment & { color: string | null; icon: string | null }>(
    `SELECT t.merchant AS merchant, t.amount AS amount, t.date AS date, c.name AS category, c.color AS color, c.icon AS icon
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.deleted = 0 AND t.type = 'expense' AND t.merchant IS NOT NULL AND t.date >= ?`,
    [monthRange(-12, new Date(now)).start]
  );
  const look = new Map(rows.map((r) => [r.merchant.trim().toLowerCase(), { color: r.color, icon: r.icon }]));
  return findRecurring(rows, now).map((r) => ({ ...r, ...(look.get(r.merchant.toLowerCase()) ?? { color: null, icon: null }) }));
}

export type CategoryTrend = { id: string | null; name: string; color: string; icon: string | null; months: number[] };

/** Spending (or income) per category for the last `months` months (oldest first), biggest overall first. */
export async function categoryTrend(db: SQLiteDatabase, months = 6, now = new Date(), kind: 'expense' | 'income' = 'expense'): Promise<CategoryTrend[]> {
  const ranges = Array.from({ length: months }, (_, i) => monthRange(i - months + 1, now));
  const byId = new Map<string, CategoryTrend>();
  const slices = await Promise.all(ranges.map((r) => categoryBreakdown(db, r.start, r.end, kind)));
  slices.forEach((list, m) => {
    for (const c of list) {
      const key = c.id ?? 'none';
      let row = byId.get(key);
      if (!row) byId.set(key, (row = { id: c.id, name: c.name, color: c.color, icon: c.icon, months: Array(months).fill(0) }));
      row.months[m] = c.total;
    }
  });
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return [...byId.values()].sort((a, b) => sum(b.months) - sum(a.months));
}

/** Spending per day of a month (index 0 = the 1st): total and number of entries. */
export async function dailySpend(db: SQLiteDatabase, start: number, end: number) {
  const days = Math.round((end - start) / 86_400_000);
  const out = Array.from({ length: days }, () => ({ total: 0, count: 0 }));
  const rows = await db.getAllAsync<{ d: number; total: number; count: number }>(
    `SELECT CAST((date - ?) / 86400000 AS INTEGER) AS d, SUM(amount) AS total, COUNT(*) AS count FROM transactions
     WHERE deleted = 0 AND type = 'expense' AND date >= ? AND date < ? GROUP BY d`,
    [start, start, end]
  );
  for (const r of rows) if (out[r.d]) out[r.d] = { total: r.total, count: r.count };
  return out;
}

export type CardStatement = {
  id: string;
  name: string;
  last4: string | null;
  network: string | null;
  limit: number | null;
  /** Null when the card has no statement day yet. */
  open: (Cycle & { total: number; count: number; top: CategorySlice[] }) | null;
  last: (Cycle & { total: number }) | null;
};

/** Each credit card / pay-later account by billing cycle: the open one so far, and the last statement. */
export async function cardStatements(db: SQLiteDatabase, now = new Date()): Promise<CardStatement[]> {
  const cards = (await listAccounts(db)).filter((a) => isCardLike(a.type));
  const spend = (id: string, c: Cycle) =>
    db.getFirstAsync<{ total: number | null; count: number }>(
      `SELECT SUM(amount) AS total, COUNT(*) AS count FROM transactions WHERE deleted = 0 AND type = 'expense' AND account_id = ? AND date >= ? AND date < ?`,
      [id, c.start, c.end]
    );
  return Promise.all(
    cards.map(async (a) => {
      const base = { id: a.id, name: a.name, last4: a.last4, network: a.network, limit: a.credit_limit };
      if (!a.billing_day) return { ...base, open: null, last: null };
      const { open, last } = cardCycles(a.billing_day, now);
      const [o, l, top] = await Promise.all([
        spend(a.id, open),
        spend(a.id, last),
        db.getAllAsync<CategorySlice>(
          `SELECT t.category_id AS id, COALESCE(c.name, 'Uncategorised') AS name, COALESCE(c.color, '#8E8E93') AS color, c.icon AS icon, SUM(t.amount) AS total
           FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.deleted = 0 AND t.type = 'expense' AND t.account_id = ? AND t.date >= ? AND t.date < ?
           GROUP BY t.category_id ORDER BY total DESC LIMIT 3`,
          [a.id, open.start, open.end]
        ),
      ]);
      return { ...base, open: { ...open, total: o?.total ?? 0, count: o?.count ?? 0, top }, last: { ...last, total: l?.total ?? 0 } };
    })
  );
}

/** The single biggest expense in a period. */
export const biggestExpense = (db: SQLiteDatabase, from: number, to: number) =>
  db.getFirstAsync<{ id: string; amount: number; date: number; merchant: string | null; note: string | null; category: string | null }>(
    `SELECT t.id, t.amount, t.date, t.merchant, t.note, c.name AS category FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.deleted = 0 AND t.type = 'expense' AND t.date >= ? AND t.date < ? ORDER BY t.amount DESC LIMIT 1`,
    [from, to]
  );
