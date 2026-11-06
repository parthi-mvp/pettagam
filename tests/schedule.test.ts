import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMonths, dueDates, nextDue } from '../src/lib/schedule.ts';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();

test('addMonths keeps the day, or the month’s last day', () => {
  assert.equal(addMonths(d(2026, 1, 31), 1), d(2026, 2, 28));
  assert.equal(addMonths(d(2026, 1, 31), 2), d(2026, 3, 31));
  assert.equal(addMonths(d(2026, 11, 5), 3), d(2027, 2, 5));
});

test('nextDue rolls a past date forward by the frequency; today counts', () => {
  const sip = { amount: 5000, every: 1 as const, next: d(2026, 1, 5) };
  assert.equal(nextDue(sip, d(2026, 11, 7)), d(2026, 12, 5));
  assert.equal(nextDue(sip, d(2026, 11, 5, )), d(2026, 11, 5));
  const premium = { amount: 12000, every: 12 as const, next: d(2024, 3, 15) };
  assert.equal(nextDue(premium, d(2026, 11, 7)), d(2027, 3, 15));
  // Rolling from the stored date, not the clamped one: 31st stays the 31st where it exists.
  assert.equal(nextDue({ amount: 1, every: 1, next: d(2026, 1, 31) }, d(2026, 3, 2)), d(2026, 3, 31));
});

test('dueDates lists the installments in a window', () => {
  const rd = { amount: 2000, every: 1 as const, next: d(2026, 11, 10) };
  assert.deepEqual(dueDates(rd, d(2026, 11, 7), d(2027, 2, 10)), [d(2026, 11, 10), d(2026, 12, 10), d(2027, 1, 10), d(2027, 2, 10)]);
  assert.deepEqual(dueDates(rd, d(2026, 11, 7), d(2026, 11, 9)), []);
});

test('dueDates on the 31st doesn’t drift after a short month', () => {
  const s = { amount: 1, every: 1 as const, next: d(2026, 1, 31) };
  assert.deepEqual(dueDates(s, d(2026, 2, 1), d(2026, 4, 30)), [d(2026, 2, 28), d(2026, 3, 31), d(2026, 4, 30)]);
});
