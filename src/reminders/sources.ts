import type { SQLiteDatabase } from 'expo-sqlite';

import { accountBalances, getSetting, listAccounts, listInvestments, setSetting } from '@/db/repo';
import { isCardLike } from '@/db/types';
import { nextMonthDay } from '@/lib/card-cycle';
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
  for (const r of recurring) {
    if (r.next < now.getTime() - 86_400_000) continue;
    dues.push({ key: `rec-${r.merchant.toLowerCase()}`, label: r.merchant, verb: 'expected', amount: r.amount, date: midnight(r.next), url: '/reports?tab=bills' });
  }
  return dues;
}
