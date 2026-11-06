import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeSyncError } from '../src/sync/errors.ts';

test('describeSyncError: offline is quiet, everything else is one plain sentence', () => {
  const android = 'fetch failed: java.net.UnknownHostException: Unable to resolve host "www.googleapis.com": No address associated';
  assert.deepEqual(describeSyncError(android), { offline: true, message: null });
  assert.equal(describeSyncError('Network request failed').offline, true);
  const full = describeSyncError('Google Drive 403: {"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}');
  assert.match(full.message ?? '', /Drive is full/);
  assert.ok(!/403|reason/.test(full.message ?? ''), 'no raw detail on screen');
  assert.match(describeSyncError('Google Drive 401: Invalid Credentials').message ?? '', /sign in again/);
  assert.match(describeSyncError('SIGN_IN_REQUIRED').message ?? '', /Reconnect/);
  assert.match(describeSyncError('VAULT_LOCKED').message ?? '', /sync password/);
  assert.ok(describeSyncError('Something odd').message);
});
