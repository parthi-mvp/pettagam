import assert from 'node:assert/strict';
import { test } from 'node:test';

import { goalProgress } from '../src/lib/goal.ts';

const now = new Date(2026, 10, 7);

test('goalProgress: per month to reach a dated goal', () => {
  const g = goalProgress(40_000, 10_000, new Date(2027, 2, 7).getTime(), now); // 7 Mar: 4 months
  assert.deepEqual([g.left, g.monthsLeft, g.perMonth, g.late], [30_000, 4, 7500, false]);
  assert.equal(goalProgress(40_000, 10_000, new Date(2027, 2, 6).getTime(), now).monthsLeft, 3);
  assert.equal(g.share, 0.25);
});

test('goalProgress: reached, no date, this month, and overdue', () => {
  assert.deepEqual([goalProgress(1000, 1500, null, now).left, goalProgress(1000, 1500, null, now).share], [0, 1]);
  assert.equal(goalProgress(1000, 100, null, now).perMonth, null);
  assert.equal(goalProgress(1000, 100, new Date(2026, 10, 20).getTime(), now).perMonth, 900);
  const late = goalProgress(1000, 100, new Date(2026, 9, 1).getTime(), now);
  assert.deepEqual([late.late, late.perMonth], [true, null]);
  assert.equal(goalProgress(1000, -50, null, now).saved, 0);
});
