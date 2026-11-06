import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickKeeper } from '../src/sync/crdt.ts';

test('pickKeeper: canonical id first, then oldest, then lowest id; same answer in any order', () => {
  const rows = [
    { id: 'z-random', created_at: 1 },
    { id: 'cat-pets', created_at: 5 },
    { id: 'a-random', created_at: 1 },
  ];
  assert.equal(pickKeeper(rows, 'cat-pets').id, 'cat-pets');
  assert.equal(pickKeeper(rows, null).id, 'a-random');
  assert.equal(pickKeeper([...rows].reverse(), null).id, 'a-random');
});
