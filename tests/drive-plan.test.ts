import assert from 'node:assert/strict';
import { test } from 'node:test';

import { logName, parseName, planPull, snapshotName, type RemoteFile } from '../src/sync/drive-plan.ts';

let n = 0;
const file = (name: string, seq?: number, t = '2026-11-06T10:00:00.000Z'): RemoteFile => ({
  id: `f${++n}`,
  name,
  modifiedTime: t,
  ...(seq != null ? { appProperties: { seq: String(seq) } } : {}),
});
const kinds = (a: ReturnType<typeof planPull>) => a.map((x) => (x.type === 'legacy' ? 'legacy' : `${x.type}:${x.device}:${x.seq ?? '-'}`));

test('names: log files sort by seq and parse back', () => {
  assert.equal(logName('ab1', 7), 'log-ab1-00000007.json');
  assert.deepEqual(parseName(file(logName('ab1', 7))), { kind: 'log', device: 'ab1', seq: 7 });
  assert.deepEqual(parseName(file(snapshotName('ab1'), 12)), { kind: 'snapshot', device: 'ab1', seq: 12 });
  assert.deepEqual(parseName(file(snapshotName('ab1'))), { kind: 'snapshot', device: 'ab1', seq: null });
  assert.equal(parseName(file('something-else.json')), null);
});

test('a phone already followed: only its new change files, in order; own files skipped', () => {
  const files = [file(logName('b', 6)), file(logName('b', 5)), file(logName('me', 9)), file(snapshotName('b'), 4)];
  assert.deepEqual(kinds(planPull(files, 'me', { b: 4 }, {})), ['log:b:5', 'log:b:6']);
});

test('a phone seen for the first time: its snapshot, then only the change files after it', () => {
  const files = [file(snapshotName('c'), 3), file(logName('c', 2)), file(logName('c', 3)), file(logName('c', 4))];
  assert.deepEqual(kinds(planPull(files, 'me', {}, {})), ['snapshot:c:3', 'log:c:4']);
});

test('a gap (change files deleted after a snapshot): the snapshot first, even if it did not change recently', () => {
  const plan = planPull([file(logName('b', 31)), file(logName('b', 32))], 'me', { b: 10 }, {});
  assert.deepEqual(kinds(plan), ['snapshot:b:-', 'log:b:31', 'log:b:32']);
  assert.equal(plan[0].type === 'snapshot' && plan[0].file, null, 'looked up by name');
});

test('nothing new: nothing to do; an older-version phone (snapshot, no seq) merges when it changes', () => {
  assert.deepEqual(planPull([file(snapshotName('b'), 8)], 'me', { b: 8 }, {}), []);
  const old = file(snapshotName('d'));
  assert.deepEqual(kinds(planPull([old], 'me', {}, {})), ['snapshot:d:-']);
  assert.deepEqual(planPull([old], 'me', {}, { [old.id]: old.modifiedTime }), []);
});

test('the first version’s shared file merges once per change', () => {
  const legacy = file('expense-manager-sync.json');
  assert.deepEqual(kinds(planPull([legacy], 'me', {}, {})), ['legacy']);
  assert.deepEqual(planPull([legacy], 'me', {}, { [legacy.id]: legacy.modifiedTime }), []);
});
