import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findRecurring } from '../src/reports/recurring.ts';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 6);
const ago = (d: number) => now - d * DAY;

test('findRecurring: steady monthly and yearly payments are found, irregular ones are not', () => {
  const pay = [
    // Netflix, monthly, steady
    ...[5, 35, 66, 96].map((d) => ({ merchant: 'Netflix', amount: 649, date: ago(d) })),
    // Rent, monthly, with a same-day retry
    ...[2, 32, 63].map((d) => ({ merchant: 'rent ', amount: 18000, date: ago(d) })),
    { merchant: 'Rent', amount: 18000, date: ago(2) + 3600_000 },
    // Swiggy: often, but no steady gap
    ...[1, 3, 4, 11, 30, 31, 52].map((d, i) => ({ merchant: 'Swiggy', amount: 300 + i * 40, date: ago(d) })),
    // Prime, yearly
    { merchant: 'Amazon Prime', amount: 1499, date: ago(20) },
    { merchant: 'Amazon Prime', amount: 1499, date: ago(385) },
    // Gym: monthly but stopped four months ago
    ...[120, 150, 181].map((d) => ({ merchant: 'Gym', amount: 1500, date: ago(d) })),
  ];
  const found = findRecurring(pay, now);
  assert.deepEqual(found.map((r) => [r.merchant, r.cadence, r.count]), [
    ['rent', 'monthly', 3], // the same-day retry "Rent" counts once
    ['Netflix', 'monthly', 4],
    ['Amazon Prime', 'yearly', 2],
  ]);
  const prime = found[2];
  assert.ok(Math.abs(prime.monthly - 1499 / 12) < 2);
  assert.ok(Math.abs(found[1].next - ago(5 - 30.5)) < 2 * DAY);
});

test('findRecurring: an amount that keeps changing is not a subscription', () => {
  const pay = [10, 40, 70, 100].map((d, i) => ({ merchant: 'Amazon', amount: [200, 1800, 450, 3200][i], date: ago(d) }));
  assert.equal(findRecurring(pay, now).length, 0);
});

test('findRecurring: a price rise on the latest charge is flagged', () => {
  const pay = [...[96, 66, 35].map((d) => ({ merchant: 'Netflix', amount: 649, date: ago(d) })), { merchant: 'Netflix', amount: 799, date: ago(5) }];
  assert.equal(findRecurring(pay, now)[0].rise, 150);
  const steady = [...[96, 66, 35, 5].map((d) => ({ merchant: 'Jio', amount: 299, date: ago(d) }))];
  assert.equal(findRecurring(steady, now)[0].rise, null);
});
