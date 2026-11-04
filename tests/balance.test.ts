import assert from 'node:assert/strict';
import { test } from 'node:test';

import { balanceOf } from '../src/db/types.ts';

test('balanceOf: assets add the flow, liabilities show what is owed', () => {
  assert.equal(balanceOf('bank', 1000, -250), 750); // spent 250 from savings
  assert.equal(balanceOf('credit_card', 2000, -500), 2500); // card spend raises the due
  assert.equal(balanceOf('pay_later', 0, -300), 300); // Pay Later behaves like a card
  assert.equal(balanceOf('borrowed', 5000, 1000), 4000); // paying a person back lowers what's owed
  assert.equal(balanceOf('lent', 2000, 500), 2500); // lending more is an asset that grows
});
