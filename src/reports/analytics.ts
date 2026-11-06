import type { SQLiteDatabase } from 'expo-sqlite';

import { accountBalances, listAccounts, listInvestments } from '@/db/repo';
import { chitPlan, chitSummary, type CashEntry } from '@/lib/chit';
import { parseDetails } from '@/lib/invest';
import { parseTags } from '@/lib/tags';
import { INVESTMENT_TYPE_LABELS, isCardLike, isLiability, type InvestmentType } from '@/db/types';
import { money, monthLabel, monthRange } from '@/lib/format';

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

export async function monthlyTrend(db: SQLiteDatabase, months = 6): Promise<MonthPoint[]> {
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const { start, end } = monthRange(-i);
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
  cards: { id: string; name: string; last4: string | null; due: number; limit: number | null; billingDay: number | null }[];
  allocation: { type: InvestmentType; label: string; value: number; invested: number; count: number }[];
};

export async function netWorth(db: SQLiteDatabase): Promise<NetWorth> {
  const [accounts, balances, investments] = await Promise.all([listAccounts(db), accountBalances(db), listInvestments(db)]);
  let bank = 0,
    bankCount = 0,
    creditCardDue = 0,
    loans = 0;
  const cards: NetWorth['cards'] = [];
  for (const a of accounts) {
    const b = balances[a.id] ?? 0;
    if (isCardLike(a.type)) {
      creditCardDue += b;
      cards.push({ id: a.id, name: a.name, last4: a.last4, due: b, limit: a.credit_limit, billingDay: a.billing_day });
    } else if (a.type === 'loan' || a.type === 'borrowed') loans += b;
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

export async function exportCsv(db: SQLiteDatabase): Promise<string> {
  const rows = await db.getAllAsync<Record<string, string | number | null>>(
    `SELECT date(t.date/1000,'unixepoch','localtime') AS date, t.type, t.amount, a.name AS account,
            ta.name AS to_account, c.name AS category, t.merchant, t.note, t.source, t.tags
     FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts ta ON ta.id=t.to_account_id
     LEFT JOIN categories c ON c.id=t.category_id WHERE t.deleted=0 ORDER BY t.date DESC`
  );
  const cols = ['date', 'type', 'amount', 'account', 'to_account', 'category', 'merchant', 'note', 'source', 'tags'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Tags as "Goa trip; Reimbursable" rather than raw JSON.
  const cell = (r: Record<string, string | number | null>, c: string) => (c === 'tags' ? parseTags(r.tags as string | null).join('; ') : r[c]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(cell(r, c))).join(','))].join('\n');
}
