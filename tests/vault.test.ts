import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { deriveKey, fromBase64, isKeySealed, isSealed, open, openWithKey, seal, sealWithKey, toBase64, WrongPasswordError } from '../src/sync/vault.ts';

const random = (n: number) => new Uint8Array(randomBytes(n));
const text = JSON.stringify({ tables: { transactions: [{ id: 't1', amount: 1499, note: 'Swiggy ₹ தமிழ்' }] } });

test('seal / open round-trip with a password; the file never contains the data', async () => {
  const file = await seal(text, 'correct horse', random);
  assert.ok(isSealed(file));
  assert.ok(!JSON.stringify(file).includes('Swiggy'));
  assert.equal(await open(file, 'correct horse'), text);
});

test('a wrong password or a changed byte is refused, never misread', async () => {
  const file = await seal(text, 'correct horse', random);
  await assert.rejects(open(file, 'Correct horse'), WrongPasswordError);
  const bytes = fromBase64(file.data);
  bytes[3] ^= 1;
  await assert.rejects(open({ ...file, data: toBase64(bytes) }, 'correct horse'), WrongPasswordError);
});

test('same text twice gives different files (fresh salt and IV)', async () => {
  const [a, b] = [await seal(text, 'pw', random), await seal(text, 'pw', random)];
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.kdf.salt, b.kdf.salt);
});

test('with a derived key (Drive files): round-trip, and the wrong key is refused', async () => {
  const key = await deriveKey('sync pw', random(16));
  const box = sealWithKey(text, key, random);
  assert.ok(isKeySealed(box) && !isSealed(box));
  assert.equal(openWithKey(box, key), text);
  assert.throws(() => openWithKey(box, random(32)), WrongPasswordError);
});

test('base64 handles large data', () => {
  const big = random(200_000);
  assert.deepEqual(fromBase64(toBase64(big)), big);
});
