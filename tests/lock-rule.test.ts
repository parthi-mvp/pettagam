import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldLock } from '../src/security/lock-rule.ts';

test('relocks only when on, away, and past the delay', () => {
  const t = 1_000_000;
  assert.equal(shouldLock(true, 60, t, t + 59_999), false); // just under a minute
  assert.equal(shouldLock(true, 60, t, t + 60_000), true); // exactly the delay
  assert.equal(shouldLock(true, 0, t, t), true); // "Immediately"
  assert.equal(shouldLock(false, 0, t, t + 3_600_000), false); // lock off
  assert.equal(shouldLock(true, 0, null, t), false); // never went to the background
});
