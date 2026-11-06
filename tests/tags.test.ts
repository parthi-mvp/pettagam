import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanTag, closeTag, mergeHints, parseTags, rankTagMatches, replaceTag, ruleTags, tagsColumn, toggleTag } from '../src/lib/tags.ts';

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

test('rankTagMatches: prefix, word start, contains, then typos', () => {
  const tags = ['Office', 'Goa trip', 'Trip to Ooty', 'Reimbursable', 'Business'];
  assert.deepEqual(rankTagMatches('tri', tags), ['Trip to Ooty', 'Goa trip']);
  assert.deepEqual(rankTagMatches('goa trp', tags), ['Goa trip']);
  assert.deepEqual(rankTagMatches('reimbursible', tags), ['Reimbursable']);
  assert.deepEqual(rankTagMatches('xyz', tags), []);
});

test('closeTag: same letters or a near miss counts as the existing tag', () => {
  const tags = ['Goa trip', 'Office', 'Tax saving'];
  assert.equal(closeTag('goa trip', tags), 'Goa trip');
  assert.equal(closeTag('Goa trp', tags), 'Goa trip');
  assert.equal(closeTag('Tax savng', tags), 'Tax saving');
  assert.equal(closeTag('Ofice', tags), 'Office');
  assert.equal(closeTag('Ooty', tags), null);
  assert.equal(closeTag('Gym', tags), null);
});
