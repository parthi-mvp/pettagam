import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cookieHeader,
  fromServer,
  jwtExpiry,
  mergeCookies,
  parseSetCookie,
  shouldApplyRemote,
  toServer,
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
