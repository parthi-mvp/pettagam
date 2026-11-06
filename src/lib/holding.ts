// What an investment holds and is worth, from its entries (no imports → unit-tested in Node, see tests/holding.test.ts).
//
// Everything is derived from the entry list, never nudged in place, so deleting or editing an entry,
// or two phones adding entries at once, always gives the right answer.

export type EntryKind = 'buy' | 'sell' | 'contribution' | 'dividend' | 'interest' | 'payout' | 'valuation';
export type Flow = { kind: EntryKind; date: number; amount: number; units: number | null };

/** How interest grows on a deposit: compounded quarterly (FD, RD), yearly (PPF, NSC), or paid out (none). */
export type Compounding = 'quarterly' | 'yearly' | 'none';

export type Holding = {
  /** Units / grams held now; null when the investment isn't counted in units. */
  units: number | null;
  /** Cost of what's still held (average cost: a sale takes out its share of the cost). */
  invested: number;
  /** Profit (or loss) already taken by selling or redeeming. */
  realised: number;
  /** Dividends and interest received. */
  income: number;
  value: number;
  /** Per unit: the live price, else the last price seen in an entry. */
  price: number | null;
  /** Where the value comes from, to say so on screen. */
  basis: 'price' | 'rate' | 'valuation' | 'cost';
  /** Date of the valuation or price the value rests on. */
  asOf: number | null;
};

const YEAR = 365.25 * 86_400_000;
const IN = new Set<EntryKind>(['buy', 'contribution']);
const OUT = new Set<EntryKind>(['sell', 'payout']);

export function growth(ratePa: number, compounding: Compounding, from: number, to: number) {
  const years = Math.max(0, (to - from) / YEAR);
  if (compounding === 'quarterly') return Math.pow(1 + ratePa / 400, 4 * years);
  if (compounding === 'yearly') return Math.pow(1 + ratePa / 100, years);
  return 1;
}

export function holding(
  flows: Flow[],
  opts: { units: boolean; rate?: number | null; compounding?: Compounding; maturity?: number | null; live?: { price: number; at: number } | null; now?: number }
): Holding {
  const now = opts.now ?? Date.now();
  const order = (k: EntryKind) => (IN.has(k) ? 0 : OUT.has(k) ? 1 : 2);
  const sorted = [...flows].sort((a, b) => a.date - b.date || order(a.kind) - order(b.kind));
  let units = 0;
  let hasUnits = false;
  let cost = 0;
  let realised = 0;
  let income = 0;
  let price: number | null = null;
  let priceAt: number | null = null;
  // The last valuation, and money in (+) / out (−) after it, dated, for growth.
  let base: { value: number; date: number } | null = null;
  let after: { amount: number; date: number }[] = [];

  for (const f of sorted) {
    const u = f.units != null && f.units > 0 ? f.units : null;
    if (IN.has(f.kind)) {
      cost += f.amount;
      if (u) {
        units += u;
        hasUnits = true;
        price = f.amount / u;
        priceAt = f.date;
      }
      after.push({ amount: f.amount, date: f.date });
    } else if (OUT.has(f.kind)) {
      const share = u && units > 0 ? Math.min(u / units, 1) : null;
      const out = share != null ? cost * share : Math.min(f.amount, cost);
      cost -= out;
      realised += f.amount - out;
      if (u) {
        units = Math.max(0, units - u);
        hasUnits = true;
        price = f.amount / u;
        priceAt = f.date;
      }
      after.push({ amount: -f.amount, date: f.date });
    } else if (f.kind === 'valuation') {
      base = { value: f.amount, date: f.date };
      after = [];
      if (u) {
        price = f.amount / u;
        priceAt = f.date;
      }
    } else income += f.amount;
  }
  if (Math.abs(cost) < 0.005) cost = 0;

  const countUnits = opts.units && hasUnits;
  const live = opts.live && opts.live.price > 0 ? opts.live : null;
  const p = live?.price ?? price;
  let value: number;
  let basis: Holding['basis'];
  let asOf: number | null;
  if (countUnits && p != null) {
    value = units * p;
    basis = 'price';
    asOf = live?.at ?? priceAt;
  } else if (opts.rate && opts.compounding && opts.compounding !== 'none') {
    const end = opts.maturity ? Math.min(now, opts.maturity) : now;
    const items = base ? [{ amount: base.value, date: base.date }, ...after] : after;
    value = items.reduce((s, x) => s + x.amount * growth(opts.rate!, opts.compounding!, x.date, end), 0);
    basis = 'rate';
    asOf = now;
  } else if (base) {
    value = base.value + after.reduce((s, x) => s + x.amount, 0);
    basis = 'valuation';
    asOf = base.date;
  } else {
    value = cost;
    basis = 'cost';
    asOf = null;
  }
  return { units: countUnits ? units : null, invested: cost, realised, income, value: Math.max(0, value), price: countUnits ? p : null, basis, asOf };
}
