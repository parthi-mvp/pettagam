import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayLabel, moneyExact, tidyName } from '../src/lib/format.ts';

test('tidyName: calms all-caps SMS merchants, keeps codes and mixed case', () => {
  assert.equal(tidyName('CRAZY SANDWICH'), 'Crazy Sandwich');
  assert.equal(tidyName('KOVARTHANAA K T'), 'Kovarthanaa K T');
  assert.equal(tidyName('PTM*ZOMATO LIMITED'), 'PTM*Zomato Limited');
  assert.equal(tidyName('ANTHROPIC* CLAUDE SUB'), 'Anthropic* Claude SUB');
  assert.equal(tidyName('SBI'), 'SBI');
  assert.equal(tidyName('Muhamad Shabeeb C T'), 'Muhamad Shabeeb C T');
  assert.equal(tidyName('swiggy@icici'), 'swiggy@icici');
});

test('moneyExact: paise only when present', () => {
  assert.match(moneyExact(8500), /^₹8,500$/);
  assert.match(moneyExact(193.64), /^₹193\.64$/);
});

test('dayLabel: today, yesterday, then dates', () => {
  const now = new Date(2026, 10, 4, 15, 0).getTime();
  assert.equal(dayLabel(new Date(2026, 10, 4, 1, 0).getTime(), now), 'Today');
  assert.equal(dayLabel(new Date(2026, 10, 3, 23, 0).getTime(), now), 'Yesterday');
  assert.match(dayLabel(new Date(2026, 10, 1).getTime(), now), /1 Nov/);
  assert.match(dayLabel(new Date(2025, 10, 1).getTime(), now), /2025/);
});
