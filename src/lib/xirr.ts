// Annualised return from dated cash flows (no imports → unit-tested in Node, see tests/xirr.test.ts).
//
// Money you put in is negative, money you got back (and what it's worth today) positive. XIRR is the
// yearly rate at which all of them, discounted to the first date, add up to zero: the honest "% a
// year" for SIPs and top-ups, where a plain gain % over the total misleads.

export type CashFlow = { amount: number; date: number };

const YEAR = 365 * 86_400_000;

function npv(rate: number, flows: CashFlow[], t0: number) {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (f.date - t0) / YEAR), 0);
}

/** As a fraction (0.12 = 12% a year); null when it can't be worked out (no money both in and out, or too short). */
export function xirr(flows: CashFlow[], minDays = 0): number | null {
  const fs = flows.filter((f) => f.amount !== 0 && Number.isFinite(f.amount)).sort((a, b) => a.date - b.date);
  if (fs.length < 2 || !fs.some((f) => f.amount < 0) || !fs.some((f) => f.amount > 0)) return null;
  const t0 = fs[0].date;
  if ((fs[fs.length - 1].date - t0) / 86_400_000 < minDays) return null;
  // Bisection on a bracket that always holds the answer for sane portfolios (−99.99% … +100,000%).
  let lo = -0.9999;
  let hi = 1000;
  let fLo = npv(lo, fs, t0);
  const fHi = npv(hi, fs, t0);
  if (Math.sign(fLo) === Math.sign(fHi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, fs, t0);
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-10) return mid;
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}
