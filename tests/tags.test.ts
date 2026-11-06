import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanTag, mergeHints, parseTags, replaceTag, ruleTags, tagsColumn, toggleTag } from '../src/lib/tags.ts';

test('cleanTag trims, drops a leading #, squeezes spaces', () => {
  assert.equal(cleanTag('  #Goa   trip '), 'Goa trip');
  assert.equal(cleanTag('   '), null);
  assert.equal(cleanTag('x'.repeat(50))?.length, 30);
});

test('tagsColumn round-trips and drops case-insensitive duplicates', () => {
  const col = tagsColumn(['Goa trip', 'goa TRIP', ' Reimbursable ', '']);
  assert.deepEqual(parseTags(col), ['Goa trip', 'Reimbursable']);
  assert.equal(tagsColumn([]), null);
});

test('parseTags survives null and garbage', () => {
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags('not json'), []);
  assert.deepEqual(parseTags('{"a":1}'), []);
  assert.deepEqual(parseTags('["ok", 3, ""]'), ['ok']);
});

test('toggleTag adds and removes regardless of case', () => {
  assert.deepEqual(toggleTag(['Trip'], 'Office'), ['Trip', 'Office']);
  assert.deepEqual(toggleTag(['Trip', 'Office'], 'office'), ['Trip']);
});

test('replaceTag renames, merges into an existing tag, or removes', () => {
  assert.deepEqual(replaceTag(['Goa', 'Office'], 'goa', 'Goa 2026'), ['Office', 'Goa 2026']);
  assert.deepEqual(replaceTag(['Goa', 'Trip'], 'Goa', 'trip'), ['Trip']);
  assert.deepEqual(replaceTag(['Goa', 'Office'], 'Goa', null), ['Office']);
  assert.deepEqual(replaceTag(['Office'], 'Goa', 'Trip'), ['Office']);
});

test('ruleTags reads the wording of a message', () => {
  assert.deepEqual(ruleTags('Rs.12,500 debited towards LIC premium policy 1234'), ['Tax saving']);
  assert.deepEqual(ruleTags('Paid via Splitwise to Ravi'), ['Shared']);
  assert.deepEqual(ruleTags('Tax invoice GSTIN 33AAA'), ['Business']);
  assert.deepEqual(ruleTags('Swiggy order 450'), []);
  assert.deepEqual(ruleTags('Policybazaar car insurance'), []);
});

test('mergeHints puts history first, drops duplicates and picked tags, caps the list', () => {
  assert.deepEqual(mergeHints(['Goa trip', 'Office'], ['tax saving', 'Shared'], ['office']), ['Goa trip', 'tax saving', 'Shared']);
  assert.deepEqual(mergeHints(['A', 'B', 'C', 'D', 'E'], [], [], 4), ['A', 'B', 'C', 'D']);
  assert.deepEqual(mergeHints(['Shared'], ['shared'], []), ['Shared']);
});
