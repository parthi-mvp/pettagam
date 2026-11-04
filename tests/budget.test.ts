import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetStatus, crossed } from '../src/budget/status.ts';

// November 2026: 30 days.
const start = new Date(2026, 10, 1).getTime();
const end = new Date(2026, 11, 1).getTime();
const day = (d: number) => new Date(2026, 10, d, 12).getTime();

test('on track: remaining, per day and a pace that fits', () => {
  const s = budgetStatus(30000, 9000, start, end, day(10));
  assert.equal(s.state, 'ok');
  assert.equal(s.remaining, 21000);
  assert.equal(s.daysLeft, 21);
  assert.equal(Math.round(s.perDay), 1000);
  assert.equal(s.projected, 27000);
  assert.equal(s.projectedOver, 0);
});

test('near: 80% used; pace warns of the overspend to come', () => {
  const s = budgetStatus(10000, 8500, start, end, day(15));
  assert.equal(s.state, 'near');
  assert.equal(s.projectedOver, 7000); // 8,500 / 15 days × 30 = 17,000
});

test('over: no remaining, no per-day, over amount', () => {
  const s = budgetStatus(5000, 6200, start, end, day(20));
  assert.equal(s.state, 'over');
  assert.equal(s.remaining, 0);
  assert.equal(s.over, 1200);
  assert.equal(s.perDay, 0);
  assert.equal(s.projectedOver, 0); // already over: say "over", not "will be over"
});

test('early in the month the pace is not projected; past months have no days left', () => {
  assert.equal(budgetStatus(30000, 4000, start, end, day(2)).projected, 4000);
  const past = budgetStatus(30000, 31000, start, end, new Date(2026, 11, 15).getTime());
  assert.equal(past.daysLeft, 0);
  assert.equal(past.state, 'over');
});

test('crossed: fires once when a save crosses 80% or 100%', () => {
  assert.equal(crossed(10000, 7000, 8200), 'near');
  assert.equal(crossed(10000, 8200, 9000), null);
  assert.equal(crossed(10000, 9500, 10200), 'over');
  assert.equal(crossed(10000, 7000, 12000), 'over');
  assert.equal(crossed(10000, 10500, 11000), null);
});
