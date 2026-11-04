import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bidCostPct, chitPlan, chitSchedule, chitSummary, maxDiscountFor, monthMath, waitReturnPct, xirr } from '../src/lib/chit.ts';

// ₹1,00,000 chit, 20 members × 20 months, ₹5,000 subscription, 5% commission, 18% GST on commission.
const p = chitPlan({ chitValue: 100000, months: 20, installment: 5000, auctions: [{ m: 2, discount: 25000 }, { m: 3, discount: 20000 }] })!;
const DAY = 86_400_000;
const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('month maths: dividend, GST share, net installment, prize', () => {
  assert.equal(p.commission, 5000);
  near(p.gstPerMember, 45); // 18% of 5,000 ÷ 20
  const m2 = monthMath(p, 25000);
  near(m2.dividend, 1000); // (25,000 − 5,000) ÷ 20
  near(m2.net, 4045); // 5,000 − 1,000 + 45
  assert.equal(m2.prize, 75000);
  near(monthMath(p, 3000).dividend, 0); // discount below commission → no dividend
});

test('schedule: recorded months exact, later months use last-3 average, last month is commission only', () => {
  const s = chitSchedule(p);
  assert.equal(s[1].discount, 25000);
  assert.ok(s[1].recorded);
  near(s[0].discount, 5000); // month 1 unrecorded, nothing before → commission
  near(s[3].discount, 22500); // average of months 2 and 3, the only ones recorded before month 4
  near(s[19].discount, 5000);
  assert.equal(s[19].prize, 95000);
});

test('xirr: 10% return vs 10% cost', () => {
  const r = xirr([{ date: 0, amount: -1000 }, { date: 365 * DAY, amount: 1100 }])!;
  near(r.pct, 10, 1e-6);
  assert.equal(r.kind, 'return');
  const c = xirr([{ date: 0, amount: 1000 }, { date: 365 * DAY, amount: -1100 }])!;
  near(c.pct, 10, 1e-6);
  assert.equal(c.kind, 'cost');
});

test('summary: opening entry covering 3 installments, not prized', () => {
  const start = new Date(2026, 0, 5).getTime();
  const s = chitSummary(p, [{ kind: 'contribution', amount: 14000, date: start, units: 3 }], start, new Date(2026, 3, 1).getTime());
  assert.equal(s.paidCount, 3);
  assert.equal(s.prized, false);
  assert.equal(s.finalPayout, 95000);
  near(s.remainingDues, s.schedule.slice(3).reduce((a, x) => a + x.net, 0));
  near(s.result, 95000 - 14000 - s.remainingDues);
  assert.equal(s.rate?.kind, 'return');
});

test('summary: prized member owes the rest; result and cost are consistent', () => {
  const start = new Date(2026, 0, 5).getTime();
  const entries = [
    { kind: 'contribution', amount: 5045, date: start, units: 1 },
    { kind: 'contribution', amount: 4045, date: start + 31 * DAY, units: 1 },
    { kind: 'payout', amount: 75000, date: start + 31 * DAY, units: null },
  ];
  const s = chitSummary(p, entries, start, start + 40 * DAY);
  assert.ok(s.prized);
  assert.equal(s.finalPayout, 0);
  assert.ok(s.result < 0); // paid more in total than the prize
  assert.equal(s.rate?.kind, 'cost');
});

test('bid advice: higher discount costs more; max bid respects the target', () => {
  const low = bidCostPct(p, 4, 10000)!;
  const high = bidCostPct(p, 4, 30000)!;
  assert.ok(high > low);
  const max = maxDiscountFor(p, 4, 12)!;
  assert.ok(bidCostPct(p, 4, max)! <= 12.01);
  assert.ok(bidCostPct(p, 4, max + 500)! > 12);
  assert.equal(bidCostPct(p, 20, 5000), null); // last month: nothing to bid for
  assert.ok(waitReturnPct(p, 4)! > 0);
});
