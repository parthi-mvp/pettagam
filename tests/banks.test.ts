import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchBank } from '../src/catalog/banks.ts';

test('matchBank: names, short forms and aliases', () => {
  assert.equal(matchBank('HDFC Millennia')?.id, 'hdfc');
  assert.equal(matchBank('State Bank savings')?.id, 'sbi');
  assert.equal(matchBank('KVB')?.id, 'kvb');
  assert.equal(matchBank('Citibank card')?.id, 'axis');
  assert.equal(matchBank('SBI Card')?.id, 'sbicard'); // longer match beats "SBI"
  assert.equal(matchBank('Indian Overseas Bank')?.id, 'iob'); // not "Indian Bank"
  assert.equal(matchBank('My chit')?.id, undefined);
});
