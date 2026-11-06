// Recurring-payment detection (no imports → unit-tested in Node, see tests/recurring.test.ts).

export type Payment = { merchant: string; amount: number; date: number; category?: string | null };
export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type Recurring = {
  merchant: string;
  cadence: Cadence;
  /** Typical amount per payment (the median), and that spread over a month. */
  amount: number;
  monthly: number;
  count: number;
  last: number;
  /** When the next one is expected (last + typical gap). */
  next: number;
  category: string | null;
  /** The latest charge went up from the usual (a price rise): by how much, else null. */
  rise: number | null;
  /** The latest charge. */
  latest: number;
};

const DAY = 86_400_000;
const CADENCES: { cadence: Cadence; days: number }[] = [
  { cadence: 'weekly', days: 7 },
  { cadence: 'monthly', days: 30.44 },
  { cadence: 'quarterly', days: 91.3 },
  { cadence: 'yearly', days: 365.25 },
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Share of values within ±tol of the reference. */
const near = (xs: number[], ref: number, tol: number) => xs.filter((x) => Math.abs(x - ref) <= ref * tol).length / xs.length;

/**
 * Payments to the same merchant at a steady gap (weekly / monthly / quarterly / yearly) and a steady
 * amount: subscriptions, rent, EMIs, bills. Irregular spending at the same place (Swiggy, a grocer)
 * fails the gap test. Ones that stopped (no payment for 1.5 gaps) are left out.
 */
export function findRecurring(payments: Payment[], now = Date.now()): Recurring[] {
  const groups = new Map<string, Payment[]>();
  for (const p of payments) {
    const key = p.merchant.trim().toLowerCase();
    if (!key || p.amount <= 0) continue;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const out: Recurring[] = [];
  for (const list of groups.values()) {
    // Same-day duplicates (a retry, a split bill) count once.
    const sorted = [...list].sort((a, b) => a.date - b.date).filter((p, i, a) => i === 0 || p.date - a[i - 1].date >= DAY);
    const gaps = sorted.slice(1).map((p, i) => (p.date - sorted[i].date) / DAY);
    if (gaps.length === 0) continue;
    const gap = median(gaps);
    const fit = CADENCES.find((c) => Math.abs(gap - c.days) <= c.days * 0.2);
    if (!fit) continue;
    // Weekly and monthly need three payments; quarterly and yearly two (one gap) is all a year shows.
    if (sorted.length < (fit.days < 60 ? 3 : 2)) continue;
    if (near(gaps, gap, 0.25) < 0.7) continue;
    const amounts = sorted.map((p) => p.amount);
    const amount = median(amounts);
    if (near(amounts, amount, 0.35) < 0.7) continue;
    const last = sorted[sorted.length - 1];
    if (now - last.date > gap * 1.5 * DAY) continue;
    const usual = median(amounts.slice(0, -1));
    const rise = last.amount - usual >= Math.max(usual * 0.05, 10) ? last.amount - usual : null;
    out.push({
      merchant: last.merchant.trim(),
      cadence: fit.cadence,
      amount,
      monthly: (amount * 30.44) / fit.days,
      count: sorted.length,
      last: last.date,
      next: last.date + gap * DAY,
      category: last.category ?? null,
      rise,
      latest: last.amount,
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}
