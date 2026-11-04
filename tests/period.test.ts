import assert from 'node:assert/strict';
import { test } from 'node:test';

import { periodRange, rangeLabel } from '../src/sms/period.ts';

const now = new Date(2026, 10, 4, 15, 30).getTime(); // 4 Nov 2026, 3:30 pm
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).getTime();

test('since last import needs a previous import', () => {
  assert.equal(periodRange('new', now, 0), null);
  assert.deepEqual(periodRange('new', now, at(2026, 10, 1)), { from: at(2026, 10, 1), to: now });
});

test('last 7 days covers today and the six days before, whole days', () => {
  const r = periodRange('7', now, 0)!;
  assert.equal(r.from + 1, at(2026, 9, 29));
  assert.equal(r.to, now);
});

test('this month and last month', () => {
  assert.equal(periodRange('month', now, 0)!.from + 1, at(2026, 10, 1));
  const last = periodRange('lastMonth', now, 0)!;
  assert.equal(last.from + 1, at(2026, 9, 1));
  assert.equal(last.to + 1, at(2026, 10, 1));
  assert.equal(rangeLabel(last, now), '1 Oct – 31 Oct');
});

test('last month in January reaches back into the previous year', () => {
  const jan = new Date(2027, 0, 10).getTime();
  const r = periodRange('lastMonth', jan, 0)!;
  assert.equal(r.from + 1, at(2026, 11, 1));
  assert.equal(rangeLabel(r, jan), '1 Dec 2026 – 31 Dec 2026');
});

test('custom range: whole days, never past now, rejects bad input', () => {
  const r = periodRange('custom', now, 0, { from: at(2026, 9, 10), to: at(2026, 9, 12) })!;
  assert.equal(r.from + 1, at(2026, 9, 10));
  assert.equal(r.to + 1, at(2026, 9, 13));
  assert.equal(periodRange('custom', now, 0, { from: at(2026, 10, 1), to: at(2026, 10, 30) })!.to, now);
  assert.equal(periodRange('custom', now, 0, { from: at(2026, 9, 12), to: at(2026, 9, 10) }), null);
  assert.equal(periodRange('custom', now, 0, { from: null, to: at(2026, 9, 10) }), null);
  assert.equal(rangeLabel(periodRange('custom', now, 0, { from: at(2026, 9, 10), to: at(2026, 9, 10) })!, now), '10 Oct');
});
