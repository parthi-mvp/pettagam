import type { SQLiteDatabase } from 'expo-sqlite';

import { accountBalances, listAccounts, listInvestments } from '@/db/repo';
import { INVESTMENT_TYPE_LABELS, type Investment, type InvestmentEntry } from '@/db/types';
import { chitPlan, chitSummary } from '@/lib/chit';
import { fdAccruedValue, parseDetails, type ChitDetails } from '@/lib/invest';
import { monthLabel, monthRange } from '@/lib/format';
import { budgetOverview } from '@/budget/queries';
import { categoryBreakdown, insights, monthlyTrend, netWorth, topMerchants } from '@/reports/analytics';
import { redactSms } from '@/sms/parser';

import { chat, useAi } from './client';
import { matchName, readAiDraft, readAiPicks, readAiSms, readJson, type AiDraft, type AiSmsItem, type Kind } from './parse';

type Cat = { name: string; kind: Kind };

const CHUNK = 25;
// shortcut: caps one scan at 100 messages to bound cost/latency; raise or paginate if users import bigger backlogs.
const MAX = 100;

const catLines = (cats: Cat[]) =>
  `Expense categories: ${cats.filter((c) => c.kind === 'expense').map((c) => c.name).join(', ')}\n` +
  `Income categories: ${cats.filter((c) => c.kind === 'income').map((c) => c.name).join(', ')}`;

/** Read bank/card/UPI SMS the rule parser couldn't, and categorise ones it could. Indexes refer to `bodies`. */
export async function aiReadSms(bodies: string[], cats: Cat[]): Promise<AiSmsItem[]> {
  const system =
    'You read Indian bank, credit card and UPI SMS alerts. For each message that records money actually debited or credited, ' +
    'return {"i": its index, "type": "expense" or "income", "amount": rupees as a number, "merchant": payee or payer name or null, ' +
    '"category": an exact name from the lists below or null}. Leave out OTPs, offers, reminders, bills due, and failed or pending payments.\n' +
    `${catLines(cats)}\nReply only with JSON: {"items": [...]}`;
  const chunks: number[] = [];
  for (let start = 0; start < Math.min(bodies.length, MAX); start += CHUNK) chunks.push(start);
  const results = await Promise.allSettled(
    chunks.map(async (start) => {
      const part = bodies.slice(start, start + CHUNK);
      const user = JSON.stringify(part.map((b, i) => ({ i, sms: redactSms(b) })));
      const reply = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { json: true });
      return readAiSms(reply, part.length, cats).map((it) => ({ ...it, i: it.i + start }));
    })
  );
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  // Every chunk failing is worth surfacing (bad key, offline); partial failures just fall back to the rules.
  const failed = results.find((r) => r.status === 'rejected');
  if (!ok.length && failed) throw failed.reason;
  return ok;
}

/** Best category name for a transaction, or null if nothing fits. */
export async function aiSuggestCategory(text: string, kind: Kind, names: string[]): Promise<string | null> {
  const reply = await chat(
    [
      {
        role: 'system',
        content:
          `Pick the single best ${kind} category for an Indian personal-finance transaction from this list: ${names.join(', ')}. ` +
          'Reply only with JSON: {"category": exact name from the list, or null if none fits}',
      },
      { role: 'user', content: text },
    ],
    { json: true }
  );
  return matchName(readJson(reply)?.category, names);
}

const rupees = (n: number) => Math.round(n);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Tone + language for prose answers; read per call so a settings change applies immediately. */
const style = () =>
  (useAi.getState().lang === 'ta'
    ? 'Write in simple, everyday Tamil (தமிழ்) script for an Indian user; keep merchant and bank names as they are. '
    : 'Write in plain, friendly English for an Indian user. ') +
  'Amounts in ₹ with Indian digit grouping. Be specific with numbers from the data; never invent figures. No headings, no markdown, no disclaimers.';

const draftPrompt = (accounts: string[], cats: Cat[]) => {
  const now = new Date();
  return (
    `Turn the user's money transaction into JSON. Today is ${now.toLocaleDateString('en-IN', { weekday: 'long' })} ${ymd(now)}.\n` +
    `Accounts: ${accounts.join(', ')}\n${catLines(cats)}\n` +
    'Reply only with JSON: {"type": "expense"|"income"|"transfer", "amount": number, "account": exact account name or null, ' +
    '"to_account": exact account name for transfers or null, "category": exact category name or null, "merchant": payee/payer or null, ' +
    '"note": anything else worth keeping or null, "date": "YYYY-MM-DD" or null}. A credit card bill payment is a transfer to the card.'
  );
};

/** "paid 450 swiggy yesterday from HDFC" → form fields. */
export async function aiDraftTransaction(text: string, accounts: string[], cats: Cat[]): Promise<AiDraft> {
  const reply = await chat([{ role: 'system', content: draftPrompt(accounts, cats) }, { role: 'user', content: text }], { json: true });
  return readAiDraft(reply, accounts, cats);
}

/** Photo of a bill or receipt (base64 JPEG) → form fields. Needs a model that accepts images. */
export async function aiDraftFromImage(base64: string, accounts: string[], cats: Cat[]): Promise<AiDraft> {
  const reply = await chat(
    [
      { role: 'system', content: draftPrompt(accounts, cats) + ' The user sent a photo of a bill or receipt: use the final total paid, the shop name and the bill date.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }] },
    ],
    { json: true }
  );
  return readAiDraft(reply, accounts, cats);
}

const slices = (rows: { name: string; total: number }[]) => rows.map((r) => ({ name: r.name, total: rupees(r.total) }));

async function monthData(db: SQLiteDatabase, offset: number) {
  const { start, end } = monthRange(offset);
  const [spent, earned, merchants, budget] = await Promise.all([
    categoryBreakdown(db, start, end),
    categoryBreakdown(db, start, end, 'income'),
    topMerchants(db, start, end, 8),
    budgetOverview(db, start, end),
  ]);
  // Budgets so the assistant can answer "am I over on food?" (state: ok / near = 80%+ / over).
  const asBudget = (name: string, s: { limit: number; spent: number; state: string; projectedOver: number }) => ({
    name,
    limit: rupees(s.limit),
    spent: rupees(s.spent),
    state: s.state,
    ...(s.projectedOver > 0 ? { projected_over_by_month_end: rupees(s.projectedOver) } : {}),
  });
  const sum = (r: { total: number }[]) => rupees(r.reduce((s, c) => s + c.total, 0));
  return {
    month: monthLabel(start),
    spent: sum(spent),
    earned: sum(earned),
    spending_by_category: slices(spent),
    income_by_category: slices(earned),
    top_merchants: merchants.map((m) => ({ merchant: m.merchant, total: rupees(m.total), payments: m.count })),
    budgets: [
      ...(budget.overall ? [asBudget('All spending', budget.overall.status)] : []),
      ...budget.categories.map((c) => asBudget(c.category?.name ?? '?', c.status)),
    ],
  };
}

/** Short written review of a month against the month before. */
export async function aiMonthSummary(db: SQLiteDatabase, offset: number) {
  const [cur, prev, notes] = await Promise.all([monthData(db, offset), monthData(db, offset - 1), offset === 0 ? insights(db) : []]);
  const partial = offset === 0 ? ` ${cur.month} is still in progress (today is day ${new Date().getDate()}).` : '';
  return chat([
    {
      role: 'system',
      content:
        `Summarise this person's month in 3 to 5 short sentences, each on its own line starting with "• ". Cover how spending and income compare with the previous month, ` +
        `the biggest changes by category or merchant, and one practical suggestion.${partial} ${style()}`,
    },
    { role: 'user', content: JSON.stringify({ this_month: cur, previous_month: prev, app_notes: notes }) },
  ]);
}

/** Everything "Ask your money" may use: totals the app already computes, never raw transactions. */
export async function moneySnapshot(db: SQLiteDatabase) {
  const months = await Promise.all(Array.from({ length: 12 }, (_, i) => monthData(db, -i)));
  const [nw, accounts, balances] = await Promise.all([netWorth(db), listAccounts(db), accountBalances(db)]);
  return {
    today: ymd(new Date()),
    average_monthly_savings_last_6_full_months: rupees(
      (await monthlyTrend(db, 7)).slice(0, 6).reduce((sum, m) => sum + m.income - m.expense, 0) / 6
    ),
    months,
    accounts: accounts.map((a) => ({ name: a.name, type: a.type, balance: rupees(balances[a.id] ?? 0), credit_limit: a.credit_limit })),
    net_worth: {
      bank_cash_wallets: rupees(nw.bank),
      investments_value: rupees(nw.investments),
      invested: rupees(nw.invested),
      card_dues: rupees(nw.creditCardDue),
      loans: rupees(nw.loans),
      net: rupees(nw.net),
      investments_by_type: nw.allocation.map((a) => ({ type: a.label, value: rupees(a.value), invested: rupees(a.invested), count: a.count })),
    },
  };
}

export type Turn = { role: 'user' | 'assistant'; content: string };

/** Answer a question from the snapshot; `history` ends with the user's question. */
export async function aiAsk(snapshot: object, history: Turn[]) {
  return chat([
    {
      role: 'system',
      content:
        "You answer questions about the user's own finances using only this data from their Pettagam app (monthly totals for the last 12 months, " +
        'account balances, net worth). For credit cards and loans, balance is the amount owed. For savings goals, work out the monthly amount needed ' +
        'and compare it with average_monthly_savings_last_6_full_months. If the data cannot answer the question, say what is missing ' +
        `instead of guessing. Keep answers under 120 words. ${style()}\nDATA: ${JSON.stringify(snapshot)}`,
    },
    // shortcut: keeps only the last 10 turns so the prompt stays small; summarise older turns if long chats matter.
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content })),
  ]);
}

function chitFacts(inv: Investment, entries: InvestmentEntry[]) {
  const plan = chitPlan(parseDetails<ChitDetails>(inv));
  if (!plan) return parseDetails(inv);
  const s = chitSummary(plan, entries, inv.start_date);
  return {
    chit_value: plan.value,
    months: plan.months,
    subscription: rupees(plan.sub),
    installments_paid: s.paidCount,
    paid_so_far: rupees(s.paid),
    dividends_so_far: rupees(s.dividendsSoFar),
    prized: s.prized,
    prize_received: rupees(s.received || s.pendingPrize),
    payout_at_end_if_not_prized: rupees(s.finalPayout),
    still_to_pay_estimate: rupees(s.remainingDues),
    projected_result_whole_chit: rupees(s.result),
    yearly_rate: s.rate ? `${s.rate.kind} ${s.rate.pct.toFixed(1)}%` : null,
  };
}

/** Plain-language read on one investment: returns, maturity, what to watch. */
export async function aiExplainInvestment(inv: Investment, entries: InvestmentEntry[]) {
  const date = (ms: number | null) => (ms ? ymd(new Date(ms)) : null);
  const data = {
    today: ymd(new Date()),
    type: INVESTMENT_TYPE_LABELS[inv.type],
    name: inv.name,
    institution: inv.institution,
    invested: rupees(inv.invested_amount),
    current_value: rupees(inv.current_value),
    quantity: inv.quantity,
    interest_rate_pct: inv.interest_rate,
    start_date: date(inv.start_date),
    maturity_date: date(inv.maturity_date),
    fd_value_today_quarterly_compounding:
      inv.type === 'fd' && inv.interest_rate && inv.start_date ? rupees(fdAccruedValue(inv.invested_amount, inv.interest_rate, inv.start_date)) : undefined,
    fd_value_at_maturity:
      inv.type === 'fd' && inv.interest_rate && inv.start_date && inv.maturity_date
        ? rupees(fdAccruedValue(inv.invested_amount, inv.interest_rate, inv.start_date, inv.maturity_date, inv.maturity_date))
        : undefined,
    details: inv.type === 'chit' ? undefined : parseDetails(inv),
    chit: inv.type === 'chit' ? chitFacts(inv, entries) : undefined,
    entries: entries.slice(0, 60).map((e) => ({ date: date(e.date), kind: e.kind, amount: rupees(e.amount), units: e.units })),
  };
  return chat([
    {
      role: 'system',
      content:
        'Explain this investment to its owner in 3 to 5 short sentences, each on its own line starting with "• ": what it has returned so far ' +
        '(absolute and rough annual %), what happens next (maturity, remaining chit installments, payouts), and one thing to keep an eye on. ' +
        `Use the provided computed values rather than recalculating. ${style()}`,
    },
    { role: 'user', content: JSON.stringify(data) },
  ]);
}

/** Pick a category for each merchant. Returns index → exact category name of the matching kind. */
export async function aiCategoriseMerchants(items: { merchant: string; type: Kind }[], cats: Cat[]) {
  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'For each Indian payment merchant or payee, pick the best category from the lists (expense list for expenses, income list for income). ' +
          `Leave out ones you can't tell.\n${catLines(cats)}\nReply only with JSON: {"items": [{"i": index, "value": exact category name}]}`,
      },
      { role: 'user', content: JSON.stringify(items.map((it, i) => ({ i, merchant: it.merchant, type: it.type }))) },
    ],
    { json: true }
  );
  const out = new Map<number, string>();
  for (const [i, v] of readAiPicks(reply, items.length)) {
    const name = matchName(v, cats.filter((c) => c.kind === items[i].type).map((c) => c.name));
    if (name) out.set(i, name);
  }
  return out;
}

/** Tidy raw merchant strings ("UPI-SWIGGY8@ICICI" → "Swiggy"). Returns index → new name, only where it changes. */
export async function aiCleanMerchants(names: string[]) {
  const reply = await chat(
    [
      {
        role: 'system',
        content:
          'Clean up merchant names from Indian bank statements and UPI alerts into the short brand or person name a person would say ' +
          '(e.g. "UPI-SWIGGY8@ICICI" → "Swiggy", "AMAZON PAY INDIA PVT" → "Amazon", "IOCL PETROL BUNK 23" → "Indian Oil"). ' +
          'Use the same spelling for the same business. Leave out names that are already clean or that you are unsure about. ' +
          'Reply only with JSON: {"items": [{"i": index, "value": clean name}]}',
      },
      { role: 'user', content: JSON.stringify(names.map((merchant, i) => ({ i, merchant }))) },
    ],
    { json: true }
  );
  const out = new Map<number, string>();
  for (const [i, v] of readAiPicks(reply, names.length)) if (v !== names[i]) out.set(i, v);
  return out;
}

/** Plain-language advice on bidding for a chit now vs waiting, from numbers the app worked out. */
export async function aiChitAdvice(
  inv: Investment,
  o: {
    month: number;
    months: number;
    discount: number;
    prizeNow: number;
    costPct: number | null;
    targetPct: number;
    maxDiscount: number | null;
    waitReturnPct: number | null;
    finalPayout: number;
    remainingDues: number;
  }
) {
  const d = parseDetails<ChitDetails>(inv);
  const pct = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
  return chat([
    {
      role: 'system',
      content:
        'You help an Indian chit fund member decide whether to bid in this month\'s auction or wait. In 4 to 6 short lines, each starting with "• ": ' +
        'say what taking the prize at this discount effectively costs per year, the biggest discount that keeps the cost under their limit, ' +
        'what waiting to the end earns per year, and compare with typical alternatives (personal loan ~11-16%, gold loan ~9-12%, FD ~6.5-7.5%). ' +
        'Bidding makes sense only if they genuinely need the money or can earn more than the cost. All rates were computed by the app ' +
        `(dividends, 18% GST on commission included); use them, do not recalculate. ${style()}`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        chit_value: d.chitValue,
        total_months: o.months,
        monthly_subscription: d.installment,
        this_month: o.month,
        discount_bid: rupees(o.discount),
        prize_if_won: rupees(o.prizeNow),
        yearly_cost_of_taking_now_pct: pct(o.costPct),
        max_cost_pct_user_accepts: o.targetPct,
        max_discount_within_that_cost: o.maxDiscount == null ? null : rupees(o.maxDiscount),
        yearly_return_of_waiting_pct: pct(o.waitReturnPct),
        payout_if_waiting_to_end: rupees(o.finalPayout),
        installments_still_to_pay_total: rupees(o.remainingDues),
      }),
    },
  ]);
}

/** Indian financial year (1 Apr to 31 Mar) containing `d`. */
export function financialYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { start: new Date(y, 3, 1).getTime(), end: new Date(y + 1, 3, 1).getTime(), label: `FY ${y}-${String(y + 1).slice(2)}` };
}

/** Section 80C / 80CCD(1B) check for the current financial year, from investment entries and education spends. */
export async function aiTaxCheck(db: SQLiteDatabase) {
  const fy = financialYear();
  const invs = await listInvestments(db);
  const paidIn = await db.getAllAsync<{ investment_id: string; total: number }>(
    `SELECT investment_id, SUM(amount) AS total FROM investment_entries
     WHERE deleted = 0 AND kind IN ('buy', 'contribution') AND date >= ? AND date < ? GROUP BY investment_id`,
    [fy.start, fy.end]
  );
  const byId = new Map(paidIn.map((r) => [r.investment_id, r.total]));
  const eligible = invs
    .filter((i) => i.type === 'ppf' || i.type === 'epf' || i.type === 'nps' || (i.type === 'mutual_fund' && /elss|tax ?saver/i.test(i.name)))
    .map((i) => ({ name: i.name, type: i.type === 'mutual_fund' ? 'ELSS' : INVESTMENT_TYPE_LABELS[i.type], paid_this_fy: rupees(byId.get(i.id) ?? 0) }));
  const education = await categoryBreakdown(db, fy.start, fy.end);
  const fees = rupees(education.find((c) => c.name === 'Education')?.total ?? 0);
  const today = new Date();
  return chat([
    {
      role: 'system',
      content:
        'You give a short Indian income-tax saving check for the current financial year, in 4 to 6 lines each starting with "• ". ' +
        'Section 80C limit is ₹1,50,000 (PPF, EPF employee share, ELSS, children\'s tuition fees, life insurance, home-loan principal). ' +
        'NPS gets an extra ₹50,000 under 80CCD(1B). These deductions apply only under the old tax regime; say so once. ' +
        'Show how much of 80C looks used and how much room is left, mention the "Education" spend only as possible tuition fees, ' +
        'and name items the app can\'t see (insurance premiums, home-loan principal). Use the given totals; do not invent amounts. ' +
        `${style()}`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        financial_year: fy.label,
        today: ymd(today),
        eligible_investments: eligible,
        education_spend_this_fy: fees,
        note: 'EPF entries may include employer share; only the employee share counts.',
      }),
    },
  ]);
}
