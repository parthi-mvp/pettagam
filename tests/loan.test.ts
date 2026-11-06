import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextMonthDay } from '../src/lib/card-cycle.ts';
import { payoff, prepaySavings } from '../src/lib/loan.ts';

test('payoff: a textbook EMI ends on time with the textbook interest', () => {
  // ₹10,00,000 at 9% for 20 years: EMI ₹8,997.26, interest ≈ ₹11,59,342.
  const p = payoff(1_000_000, 9, 8997.26)!;
  assert.equal(p.months, 240);
  assert.ok(Math.abs(p.interest - 1_159_342) < 50, String(p.interest));
});

test('payoff: zero rate, already paid, and an EMI below the interest', () => {
  assert.deepEqual([payoff(10_000, 0, 3000)!.months, payoff(10_000, 0, 3000)!.interest], [4, 0]);
  assert.equal(payoff(0, 9, 5000)!.months, 0);
  assert.equal(payoff(1_000_000, 12, 10_000), null); // interest alone is ₹10,000 a month
});

test('prepaySavings: a lump sum shortens the loan and saves interest', () => {
  const s = prepaySavings(1_000_000, 9, 8997.26, 100_000)!;
  assert.ok(s.months > 45 && s.months < 60, String(s.months));
  assert.ok(s.interest > 200_000, String(s.interest));
  assert.deepEqual(prepaySavings(1_000_000, 9, 8997.26, 0), { months: 0, interest: 0 });
});

test('nextMonthDay: today counts, past days roll to next month, 31 clamps', () => {
  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
  assert.equal(nextMonthDay(7, new Date(2026, 10, 7, 15)), d(2026, 11, 7));
  assert.equal(nextMonthDay(5, new Date(2026, 10, 7)), d(2026, 12, 5));
  assert.equal(nextMonthDay(31, new Date(2027, 1, 3)), d(2027, 2, 28));
  assert.equal(nextMonthDay(2, new Date(2026, 11, 20)), d(2027, 1, 2));
});
