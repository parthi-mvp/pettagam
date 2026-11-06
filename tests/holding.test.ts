import assert from 'node:assert/strict';
import { test } from 'node:test';

import { holding, type Flow } from '../src/lib/holding.ts';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const now = d(2026, 11, 7);
const f = (kind: Flow['kind'], date: number, amount: number, units: number | null = null): Flow => ({ kind, date, amount, units });

test('a sale takes out its share of the cost; the rest is realised gain', () => {
  // Buy 100 for ₹1,000, sell 50 for ₹1,500: ₹500 of cost leaves, ₹1,000 profit, 50 units left at ₹30.
  const h = holding([f('buy', d(2026, 1, 1), 1000, 100), f('sell', d(2026, 6, 1), 1500, 50)], { units: true, now });
  assert.deepEqual([h.units, h.invested, h.realised, h.value, h.basis], [50, 500, 1000, 1500, 'price']);
});

test('average cost across buys at different prices', () => {
  const h = holding([f('buy', d(2026, 1, 1), 1000, 10), f('buy', d(2026, 2, 1), 2000, 10), f('sell', d(2026, 3, 1), 3000, 10)], { units: true, now });
  // 20 units cost ₹3,000 (₹150 avg); selling 10 for ₹3,000 removes ₹1,500 of cost.
  assert.deepEqual([h.units, h.invested, h.realised], [10, 1500, 1500]);
});

test('SIP contributions count units; a live price values them', () => {
  const sip = [f('contribution', d(2026, 1, 5), 5000, 50), f('contribution', d(2026, 2, 5), 5000, 45.5)];
  const h = holding(sip, { units: true, live: { price: 120, at: now }, now });
  assert.equal(h.units, 95.5);
  assert.equal(h.value, 95.5 * 120);
  assert.equal(h.invested, 10000);
});

test('removing an entry removes its money from the value too (nothing is nudged in place)', () => {
  const kept = [f('buy', d(2026, 1, 1), 50_000)];
  assert.equal(holding([...kept, f('buy', d(2026, 2, 1), 10_000)], { units: false, now }).value, 60_000);
  assert.equal(holding(kept, { units: false, now }).value, 50_000);
});

test('a valuation sets the value; money after it moves it', () => {
  const h = holding([f('buy', d(2026, 1, 1), 100_000), f('valuation', d(2026, 6, 1), 112_000), f('buy', d(2026, 7, 1), 10_000), f('sell', d(2026, 8, 1), 5_000)], { units: false, now });
  assert.deepEqual([h.value, h.basis, h.invested], [117_000, 'valuation', 105_000]);
  // A valuation with units gives a price for unit holdings.
  const g = holding([f('buy', d(2026, 1, 1), 60_000, 10), f('valuation', d(2026, 9, 1), 75_000, 10)], { units: true, now });
  assert.deepEqual([g.price, g.value], [7500, 75_000]);
});

test('FD grows live at its rate and stops at maturity; a payout empties it with interest realised', () => {
  const fd = [f('buy', d(2025, 11, 7), 100_000)];
  const h = holding(fd, { units: false, rate: 7, compounding: 'quarterly', now });
  assert.ok(Math.abs(h.value - 107_181) < 2, String(h.value)); // 7% quarterly over 365 days
  const matured = holding(fd, { units: false, rate: 7, compounding: 'quarterly', maturity: d(2026, 5, 7), now });
  assert.ok(matured.value < 103_600 && matured.value > 103_400, String(matured.value));
  const paid = holding([...fd, f('payout', d(2026, 11, 7), 107_186)], { units: false, rate: 7, compounding: 'quarterly', now });
  assert.deepEqual([Math.round(paid.value), paid.invested, paid.realised], [0, 0, 7186]);
});

test('RD: each installment grows from its own date', () => {
  const rd = [f('contribution', d(2026, 9, 7), 5000), f('contribution', d(2026, 10, 7), 5000)];
  const h = holding(rd, { units: false, rate: 7, compounding: 'quarterly', now });
  assert.ok(h.value > 10_000 && h.value < 10_100, String(h.value));
});

test('dividends and interest are income, not cost or value', () => {
  const h = holding([f('buy', d(2026, 1, 1), 1000, 10), f('dividend', d(2026, 5, 1), 40)], { units: true, now });
  assert.deepEqual([h.income, h.invested, h.value], [40, 1000, 1000]);
});

test('everything sold: no units, no value, gain realised', () => {
  const h = holding([f('buy', d(2026, 1, 1), 1000, 10), f('sell', d(2026, 2, 1), 1200, 10)], { units: true, now });
  assert.deepEqual([h.units, h.value, h.invested, h.realised], [0, 0, 0, 200]);
});

test('maturityValue: an RD with installments still to come', async () => {
  const { maturityValue } = await import('../src/lib/holding.ts');
  // 12 monthly ₹1,000 at 7% quarterly. Banks' RD formula M = R·((1+i)^n − 1)/(1 − (1+i)^(−1/3)), i = 1.75%, n = 4: ₹12,463.
  const first = d(2026, 1, 1);
  const paid = [f('contribution', first, 1000)];
  const upcoming = Array.from({ length: 11 }, (_, i) => ({ amount: 1000, date: new Date(2026, i + 1, 1).getTime() }));
  const v = maturityValue(paid, { rate: 7, compounding: 'quarterly', maturity: d(2027, 1, 1), upcoming });
  assert.ok(Math.abs(v - 12_463) < 5, String(v));
});
