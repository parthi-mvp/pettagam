// Chit fund maths (auction chits under the Chit Funds Act, 1982). Pure TypeScript, no runtime imports,
// so it runs in Node tests (tests/chit.test.ts).
//
// Each month one member takes the pot by bidding the biggest discount D.
//   prize to the winner     = chit value − D
//   foreman commission      = commission% × chit value (paid out of D; capped at 7% since 2019)
//   dividend to each member = (D − commission) ÷ members   ("share of discount", winner included)
//   GST on commission       = 18% (since Jul 2022), spread across members' monthly bills
//   net installment         = subscription − dividend + GST share
// Dividends are applied to the same month's installment, as most Tamil Nadu chits do.

export type ChitAuction = { m: number; discount: number };

export type ChitDetails = {
  chitValue?: number;
  months?: number;
  installment?: number; // full monthly subscription before dividend
  members?: number; // defaults to months
  commissionPct?: number;
  gstPct?: number;
  auctions?: ChitAuction[]; // discount per month, from the company's monthly statement
  wonMonth?: number | null; // month this member took the prize
};

export const CHIT_DEFAULTS = { commissionPct: 5, gstPct: 18 };
export const MAX_COMMISSION_PCT = 7;
// Often cited cap on discount; not enforced, only warned about. Check the chit agreement.
export const DISCOUNT_WARN_PCT = 40;

export type ChitPlan = {
  value: number;
  months: number;
  members: number;
  sub: number;
  commission: number;
  gstPerMember: number;
  auctions: Map<number, number>;
  wonMonth: number | null;
};

export function chitPlan(d: ChitDetails): ChitPlan | null {
  const value = d.chitValue ?? 0;
  const months = Math.round(d.months ?? 0);
  if (!(value > 0) || months < 2) return null;
  const members = d.members && d.members > 0 ? Math.round(d.members) : months;
  const commission = (value * (d.commissionPct ?? CHIT_DEFAULTS.commissionPct)) / 100;
  return {
    value,
    months,
    members,
    sub: d.installment && d.installment > 0 ? d.installment : value / members,
    commission,
    gstPerMember: (commission * (d.gstPct ?? CHIT_DEFAULTS.gstPct)) / 100 / members,
    auctions: new Map((d.auctions ?? []).filter((a) => a.m >= 1 && a.m <= months && a.discount >= 0).map((a) => [a.m, a.discount])),
    wonMonth: d.wonMonth && d.wonMonth >= 1 && d.wonMonth <= months ? d.wonMonth : null,
  };
}

/** One month's money given that month's auction discount. */
export function monthMath(p: ChitPlan, discount: number) {
  const dividend = Math.max(0, discount - p.commission) / p.members;
  return { dividend, net: p.sub - dividend + p.gstPerMember, prize: p.value - discount };
}

/**
 * Discount assumed for a month with no recorded auction: the average of the last three recorded
 * before it (discounts usually shrink as a chit ages), or just the commission (no dividend) if none.
 * The final month has no one left to bid against, so only the commission is deducted.
 */
export function assumedDiscount(p: ChitPlan, m: number) {
  if (m >= p.months) return p.commission;
  const recent = [...p.auctions].filter(([k]) => k < m).sort((a, b) => a[0] - b[0]).slice(-3).map(([, d]) => d);
  return recent.length ? recent.reduce((s, d) => s + d, 0) / recent.length : p.commission;
}

export type ChitMonth = { m: number; discount: number; dividend: number; net: number; prize: number; recorded: boolean };

export function chitSchedule(p: ChitPlan): ChitMonth[] {
  return Array.from({ length: p.months }, (_, i) => {
    const m = i + 1;
    const recorded = p.auctions.has(m);
    const discount = recorded ? p.auctions.get(m)! : assumedDiscount(p, m);
    return { m, discount, recorded, ...monthMath(p, discount) };
  });
}

export const addMonths = (ms: number, k: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + k, d.getDate()).getTime();
};

/** Monthly rate where the flows' present value is zero (flows must change sign); null if none in range. */
export function irr(flows: number[]): number | null {
  const npv = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  return bisect(npv, -0.99, 1);
}

export type Flow = { date: number; amount: number };

/**
 * Annual rate for dated cash flows (like Excel XIRR), labelled by what it means:
 * "return" when you put money in first and get it back later, "cost" when you got money first (like a loan).
 */
export function xirr(flows: Flow[]): { pct: number; kind: 'return' | 'cost' } | null {
  if (flows.length < 2) return null;
  const t0 = Math.min(...flows.map((f) => f.date));
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (f.date - t0) / (365 * 86_400_000)), 0);
  const r = bisect(npv, -0.99, 10);
  if (r == null) return null;
  // Present value falls as the rate rises for investments, rises for loans.
  const kind = npv(r + 1e-4) < npv(r - 1e-4) ? 'return' : 'cost';
  return { pct: r * 100, kind };
}

function bisect(f: (r: number) => number, lo: number, hi: number): number | null {
  let flo = f(lo);
  if (!isFinite(flo) || flo * f(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (flo * fm <= 0) hi = mid;
    else [lo, flo] = [mid, fm];
  }
  return (lo + hi) / 2;
}

const annualPct = (monthly: number) => (Math.pow(1 + monthly, 12) - 1) * 100;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export type CashEntry = { kind: string; amount: number; date: number; units: number | null };

/** Where this chit stands: paid, dividends, prize, what's left, the projected result and its yearly rate. */
export function chitSummary(p: ChitPlan, entries: CashEntry[], startDate: number | null, now = Date.now()) {
  const contrib = entries.filter((e) => e.kind === 'contribution' || e.kind === 'buy');
  const payouts = entries.filter((e) => e.kind === 'payout');
  const paid = sum(contrib.map((e) => e.amount));
  // `units` on a chit contribution = how many installments it covers (an opening balance can cover several).
  const paidCount = Math.min(p.months, sum(contrib.map((e) => (e.units && e.units > 0 ? Math.round(e.units) : 1))));
  const received = sum(payouts.map((e) => e.amount));
  const schedule = chitSchedule(p);
  const prized = received > 0 || p.wonMonth != null;
  const pendingPrize = p.wonMonth != null && received === 0 ? schedule[p.wonMonth - 1].prize : 0;
  const remaining = schedule.slice(paidCount);
  const remainingDues = sum(remaining.map((x) => x.net));
  const finalPayout = prized ? 0 : schedule[p.months - 1].prize;
  const result = received + pendingPrize + finalPayout - paid - remainingDues;

  const first = startDate ?? (contrib.length ? Math.min(...contrib.map((e) => e.date)) : now);
  const due = (m: number) => Math.max(now, addMonths(first, m - 1));
  const flows: Flow[] = [
    ...contrib.map((e) => ({ date: e.date, amount: -e.amount })),
    ...payouts.map((e) => ({ date: e.date, amount: e.amount })),
    ...remaining.map((x) => ({ date: due(x.m), amount: -x.net })),
  ];
  if (pendingPrize) flows.push({ date: due(p.wonMonth!), amount: pendingPrize });
  if (finalPayout) flows.push({ date: due(p.months), amount: finalPayout });

  return {
    schedule,
    paid,
    paidCount,
    received,
    prized,
    pendingPrize,
    remainingDues,
    finalPayout,
    result,
    dividendsSoFar: sum(schedule.slice(0, paidCount).map((x) => x.dividend)),
    rate: xirr(flows),
    next: remaining[0] ?? null,
    nextDueDate: remaining[0] ? addMonths(first, remaining[0].m - 1) : null,
    endDate: addMonths(first, p.months - 1),
    done: paidCount >= p.months,
  };
}

/** Yearly cost of winning month `m`'s auction with `discount`: prize now, then the remaining net installments. */
export function bidCostPct(p: ChitPlan, m: number, discount: number): number | null {
  if (m < 1 || m >= p.months) return null;
  const schedule = chitSchedule(p);
  const now = monthMath(p, discount);
  const flows = [now.prize - now.net, ...schedule.slice(m).map((x) => -x.net)];
  const r = irr(flows);
  return r == null ? null : annualPct(r);
}

/** Biggest discount you can bid in month `m` and still keep the yearly cost at or under `targetPct`. */
export function maxDiscountFor(p: ChitPlan, m: number, targetPct: number): number | null {
  const lo = p.commission;
  const hi = p.value * 0.5;
  const at = (d: number) => bidCostPct(p, m, d);
  const cLo = at(lo);
  if (cLo == null || cLo > targetPct) return null;
  if ((at(hi) ?? Infinity) <= targetPct) return hi;
  const d = bisect((x) => (at(x) ?? Infinity) - targetPct, lo, hi);
  return d == null ? null : Math.floor(d);
}

/** Yearly return from paying every installment from month `m` and taking the last month's payout. */
export function waitReturnPct(p: ChitPlan, m: number): number | null {
  if (m < 1 || m > p.months) return null;
  const rest = chitSchedule(p).slice(m - 1);
  const flows = rest.map((x, i) => -x.net + (i === rest.length - 1 ? x.prize : 0));
  const r = irr(flows);
  return r == null ? null : annualPct(r);
}
