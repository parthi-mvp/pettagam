import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cookieHeader,
  describeSyncError,
  fromServer,
  jwtExpiry,
  mergeCookies,
  parseSetCookie,
  shouldApplyRemote,
  toServer,
  uploadRows,
} from '../src/sync/wire.ts';

test('toServer strips server columns and parses details JSON', () => {
  const out = toServer({ id: 'i', updated_at: 1, user_id: 'x', rev: 9, details: '{"months":20}' });
  assert.deepEqual(out, { id: 'i', updated_at: 1, details: { months: 20 } });
});

test('fromServer strips server columns, stringifies details, coerces numeric strings', () => {
  const out = fromServer({ id: 'i', updated_at: '5', amount: '250.50', user_id: 'u', rev: 3, details: { a: 1 }, name: '42' });
  assert.deepEqual(out, { id: 'i', updated_at: 5, amount: 250.5, details: '{"a":1}', name: '42' });
});

test('shouldApplyRemote: server wins unless phone has a newer pending edit', () => {
  assert.equal(shouldApplyRemote(5, null, false), true);
  assert.equal(shouldApplyRemote(5, { updated_at: 5 }, false), true);
  assert.equal(shouldApplyRemote(4, { updated_at: 5 }, false), false);
  assert.equal(shouldApplyRemote(5, { updated_at: 9 }, true), false);
  assert.equal(shouldApplyRemote(10, { updated_at: 9 }, true), true);
});

test('parseSetCookie handles joined headers, Expires commas and clears', () => {
  const h =
    '__Secure-neon-auth.session_token=abc.def; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly; Secure, ' +
    'other=1; Path=/, gone=; Max-Age=0';
  assert.deepEqual(parseSetCookie(h), { '__Secure-neon-auth.session_token': 'abc.def', other: '1', gone: '' });
  const jar = mergeCookies({ gone: 'x', keep: 'y' }, parseSetCookie(h));
  assert.equal(cookieHeader(jar), 'keep=y; __Secure-neon-auth.session_token=abc.def; other=1');
});

test('jwtExpiry reads exp claim', () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'u', exp: 1700000000 })).toString('base64url');
  assert.equal(jwtExpiry(`h.${payload}.s`, (b) => Buffer.from(b, 'base64').toString()), 1700000000000);
  assert.equal(jwtExpiry('garbage'), 0);
});

test('uploadRows: one rejected row does not hold back the others', async () => {
  const rejected = new Error('Data API 400: billing_day check');
  const sent: string[] = [];
  const upload = async (rows: Record<string, unknown>[]) => {
    if (rows.some((r) => r.id === 'bad')) throw rejected;
    sent.push(...rows.map((r) => String(r.id)));
  };
  const failed = await uploadRows([{ id: 'a' }, { id: 'bad' }, { id: 'b' }], upload, (e) => e === rejected);
  assert.deepEqual(sent, ['a', 'b']);
  assert.deepEqual([...failed.keys()], ['bad']);
});

test('uploadRows: other errors (offline, auth) are thrown, not swallowed', async () => {
  const offline = new Error('Network request failed');
  await assert.rejects(
    uploadRows([{ id: 'a' }], async () => {
      throw offline;
    }, () => false),
    offline
  );
});

test('describeSyncError: offline is quiet, everything else is one plain sentence', () => {
  const android = 'fetch failed: java.net.UnknownHostException: Unable to resolve host "ep-x.apirest.neon.tech": No address associated';
  assert.deepEqual(describeSyncError(android), { offline: true, message: null });
  assert.equal(describeSyncError('Network request failed').offline, true);
  assert.equal(describeSyncError('timeout of 60000ms exceeded').offline, true);
  const schema = describeSyncError('Data API 400 on /transactions?on_conflict=user_id,id: {"code":"PGRST204","message":"column \\"via\\" does not exist"}');
  assert.equal(schema.offline, false);
  assert.ok(schema.message && !/PGRST|transactions|column/.test(schema.message), 'no backend detail on screen');
  assert.match(describeSyncError('Session expired. Please sign in again.').message ?? '', /Sign in again/);
  assert.ok(describeSyncError('Something odd').message);
});
