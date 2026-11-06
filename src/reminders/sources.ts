import type { SQLiteDatabase } from 'expo-sqlite';

import { accountBalances, getSetting, listAccounts, listInvestments, setSetting } from '@/db/repo';
import { isCardLike } from '@/db/types';
import { nextMonthDay } from '@/lib/card-cycle';
import { money } from '@/lib/format';
import { parseDetails, scheduleOf, yearlyMinimum, type PlanDetails } from '@/lib/invest';
import { nextDue } from '@/lib/schedule';
import { chitStatuses, recurringPayments } from '@/reports/analytics';

import type { Due } from './plan';

const HIDDEN_KEY = 'recurring_hidden';
const midnight = (t: number) => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime();

/** Merchants the user marked "not a subscription" (this phone only). Lower-cased. */
export async function hiddenRecurring(db: SQLiteDatabase): Promise<string[]> {
  try {
    return JSON.parse((await getSetting(db, HIDDEN_KEY)) ?? '[]');
  } catch {
    return [];
  }
}
export async function setRecurringHidden(db: SQLiteDatabase, merchant: string, hidden: boolean) {
  const key = merchant.trim().toLowerCase();
  const list = (await hiddenRecurring(db)).filter((m) => m !== key);
  await setSetting(db, HIDDEN_KEY, JSON.stringify(hidden ? [...list, key] : list));
}

export const clearRecurringHidden = (db: SQLiteDatabase) => setSetting(db, HIDDEN_KEY, '[]');

/** Recurring payments, without the ones marked "not a subscription". */
export async function visibleRecurring(db: SQLiteDatabase, now = Date.now()) {
  const [all, hidden] = await Promise.all([recurringPayments(db, now), hiddenRecurring(db)]);
  return all.filter((r) => !hidden.includes(r.merchant.toLowerCase()));
}

/** Everything with a date coming up: card bills, EMIs, chit installments and expected recurring charges. */
export async function collectDues(db: SQLiteDatabase, now = new Date()): Promise<Due[]> {
  const [accounts, balances, investments, recurring] = await Promise.all([listAccounts(db), accountBalances(db), listInvestments(db), visibleRecurring(db, now.getTime())]);
  const dues: Due[] = [];
  for (const a of accounts) {
    const owed = balances[a.id] ?? 0;
    if (!a.due_day || owed < 1) continue;
    const url = `/account-form?id=${a.id}`;
    if (isCardLike(a.type)) dues.push({ key: `card-${a.id}`, label: `${a.name} bill`, verb: 'due', amount: owed, date: nextMonthDay(a.due_day, now), url });
    else if (a.type === 'loan') dues.push({ key: `emi-${a.id}`, label: `${a.name} EMI`, verb: 'due', amount: a.emi ?? null, date: nextMonthDay(a.due_day, now), url });
  }
  for (const c of await chitStatuses(db, investments)) {
    if (c.summary.done || !c.summary.next || !c.summary.nextDueDate) continue;
    dues.push({ key: `chit-${c.id}`, label: `${c.name} installment`, verb: 'due', amount: c.summary.next.net, date: midnight(c.summary.nextDueDate), url: `/investment/${c.id}` });
  }
  // Investments: regular payments (SIP, RD, premium), maturities, and PPF / SSY's yearly minimum.
  const fyStart = new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1).getTime();
  const paidThisYear = new Map(
    (
      await db.getAllAsync<{ id: string; paid: number }>(
        `SELECT investment_id AS id, SUM(amount) AS paid FROM investment_entries
         WHERE deleted = 0 AND kind IN ('buy', 'contribution') AND date >= ? GROUP BY investment_id`,
        [fyStart]
      )
    ).map((r) => [r.id, r.paid])
  );
  for (const inv of investments) {
    if (inv.type === 'chit') continue;
    const url = `/investment/${inv.id}`;
    const plan = parseDetails<PlanDetails>(inv);
    const kind = scheduleOf(inv.type);
    if (plan.schedule && kind && (!inv.maturity_date || inv.maturity_date >= now.getTime())) {
      dues.push({ key: `plan-${inv.id}`, label: `${inv.name} ${kind.label.toLowerCase()}`, verb: 'due', amount: plan.schedule.amount, date: nextDue(plan.schedule, now.getTime()), url });
    }
    if (inv.maturity_date && inv.maturity_date >= midnight(now.getTime())) {
      dues.push({ key: `mat-${inv.id}`, label: inv.name, verb: 'matures', amount: inv.current_value || null, date: midnight(inv.maturity_date), url });
    }
    const min = yearlyMinimum(inv.type);
    if (min && (paidThisYear.get(inv.id) ?? 0) < min) {
      const fyEnd = new Date(new Date(fyStart).getFullYear() + 1, 2, 31).getTime();
      dues.push({ key: `min-${inv.id}`, label: `${inv.name}: ${money(min)} yearly minimum`, verb: 'due', amount: null, date: fyEnd, url });
    }
  }

  for (const r of recurring) {
    if (r.next < now.getTime() - 86_400_000) continue;
    dues.push({ key: `rec-${r.merchant.toLowerCase()}`, label: r.merchant, verb: 'expected', amount: r.amount, date: midnight(r.next), url: '/reports?tab=bills' });
  }
  return dues;
}
