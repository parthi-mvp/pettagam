import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardCycles } from '../src/lib/card-cycle.ts';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();

test('cardCycles: before, on and after the statement day', () => {
  // Statement on the 12th. On 6 Nov the open cycle is 13 Oct – 12 Nov; the last one 13 Sep – 12 Oct.
  const a = cardCycles(12, new Date(2026, 10, 6));
  assert.deepEqual([a.open.start, a.open.end, a.open.statement], [d(2026, 10, 13), d(2026, 11, 13), d(2026, 11, 12)]);
  assert.deepEqual([a.last.start, a.last.end], [d(2026, 9, 13), d(2026, 10, 13)]);
  // On the statement day itself the cycle is still open (it closes at the end of the day).
  assert.equal(cardCycles(12, new Date(2026, 10, 12, 18)).open.statement, d(2026, 11, 12));
  // The day after, a new one opens.
  assert.equal(cardCycles(12, new Date(2026, 10, 13)).open.start, d(2026, 11, 13));
});

test('cardCycles: a 31st statement day in short months and across the year end', () => {
  const feb = cardCycles(31, new Date(2027, 1, 10));
  assert.deepEqual([feb.open.start, feb.open.statement], [d(2027, 2, 1), d(2027, 2, 28)]);
  assert.equal(feb.last.start, d(2027, 1, 1));
  const jan = cardCycles(5, new Date(2027, 0, 20));
  assert.deepEqual([jan.open.start, jan.open.statement, jan.last.start], [d(2027, 1, 6), d(2027, 2, 5), d(2026, 12, 6)]);
});
