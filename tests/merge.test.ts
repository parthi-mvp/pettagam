import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeTable } from '../src/sync/merge.ts';

test('newer remote row wins and is applied locally', () => {
  const r = mergeTable([{ id: 'a', updated_at: 1, v: 'old' }], [{ id: 'a', updated_at: 2, v: 'new' }]);
  assert.deepEqual(r.toApplyLocally, [{ id: 'a', updated_at: 2, v: 'new' }]);
});

test('newer local row wins', () => {
  const r = mergeTable([{ id: 'a', updated_at: 5, v: 'local' }], [{ id: 'a', updated_at: 2, v: 'remote' }]);
  assert.equal(r.toApplyLocally.length, 0);
});

test('only remote rows missing here or newer are applied; a newer local delete stays', () => {
  const r = mergeTable(
    [{ id: 'a', updated_at: 1 }, { id: 'b', updated_at: 9, deleted: 1 }],
    [{ id: 'b', updated_at: 3, deleted: 0 }, { id: 'c', updated_at: 4 }]
  );
  assert.deepEqual(r.toApplyLocally.map((x) => x.id), ['c']);
});

test('identical sides need nothing', () => {
  const rows = [{ id: 'a', updated_at: 1 }];
  const r = mergeTable(rows, rows);
  assert.equal(r.toApplyLocally.length, 0);
});
