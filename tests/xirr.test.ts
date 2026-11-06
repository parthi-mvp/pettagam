import assert from 'node:assert/strict';
import { test } from 'node:test';

import { xirr } from '../src/lib/xirr.ts';

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day)).getTime();
const near = (a: number | null, b: number, tol = 1e-4) => assert.ok(a != null && Math.abs(a - b) < tol, `${a} vs ${b}`);

test('one lump sum: 10,000 → 11,000 in exactly a year is 10%', () => {
  near(xirr([{ amount: -10_000, date: d(2025, 1, 1) }, { amount: 11_000, date: d(2026, 1, 1) }]), 0.1);
});

test('matches the spreadsheet XIRR for an uneven series', () => {
  // Excel's documented example: XIRR = 37.34%.
  const flows = [
    { amount: -10_000, date: d(2008, 1, 1) },
    { amount: 2_750, date: d(2008, 3, 1) },
    { amount: 4_250, date: d(2008, 10, 30) },
    { amount: 3_250, date: d(2009, 2, 15) },
    { amount: 2_750, date: d(2009, 4, 1) },
  ];
  near(xirr(flows), 0.373362535, 1e-5);
});

test('a SIP that ends where it started is about 0%, a loss is negative', () => {
  const sip = Array.from({ length: 12 }, (_, i) => ({ amount: -1000, date: d(2025, i + 1, 5) }));
  near(xirr([...sip, { amount: 12_000, date: d(2026, 1, 5) }]), 0, 1e-6);
  const r = xirr([...sip, { amount: 11_000, date: d(2026, 1, 5) }]);
  assert.ok(r != null && r < 0);
});

test('nothing to work out: only money in, too short, or empty', () => {
  assert.equal(xirr([{ amount: -1000, date: d(2025, 1, 1) }]), null);
  assert.equal(xirr([{ amount: -1000, date: d(2025, 1, 1) }, { amount: -500, date: d(2025, 6, 1) }]), null);
  assert.equal(xirr([{ amount: -1000, date: d(2025, 1, 1) }, { amount: 1100, date: d(2025, 2, 1) }], 180), null);
  assert.equal(xirr([]), null);
});
