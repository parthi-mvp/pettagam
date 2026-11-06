import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchName, readAiDraft, readAiPicks, readAiSms, readAiSuggestion } from '../src/ai/parse.ts';
import { looksLikeTxn, redactSms } from '../src/sms/parser.ts';

const cats = [
  { name: 'Food & Dining', kind: 'expense' as const },
  { name: 'Salary', kind: 'income' as const },
];

test('readAiSms keeps valid items and drops junk', () => {
  const reply = '```json\n' + JSON.stringify({
    items: [
      { i: 0, type: 'expense', amount: '1,250.50', merchant: ' Swiggy ', category: 'food & dining' },
      { i: 1, type: 'income', amount: 50000, merchant: '', category: 'Food & Dining' }, // wrong-kind category → null
      { i: 1, type: 'expense', amount: 5 }, // duplicate index
      { i: 9, type: 'expense', amount: 5 }, // out of range
      { i: 2, type: 'refund', amount: 5 },
      { i: 2, type: 'expense', amount: -5 },
    ],
  }) + '\n```';
  assert.deepEqual(readAiSms(reply, 3, cats), [
    { i: 0, type: 'expense', amount: 1250.5, merchant: 'Swiggy', category: 'Food & Dining' },
    { i: 1, type: 'income', amount: 50000, merchant: null, category: null },
  ]);
  assert.deepEqual(readAiSms('{"nope":1}', 3, cats), []);
  assert.throws(() => readAiSms('not json', 3, cats));
});

test('matchName only returns names from the list', () => {
  assert.equal(matchName('SALARY', ['Salary']), 'Salary');
  assert.equal(matchName('Bonus', ['Salary']), null);
  assert.equal(matchName(42, ['Salary']), null);
});

test('redactSms masks account digits and long refs but keeps amounts', () => {
  assert.equal(
    redactSms('Rs 150000.00 debited from A/c XX1234 Ref 412345678901'),
    'Rs 150000.00 debited from A/c XX#### Ref #########'
  );
});

test('redactSms hides names, UPI IDs, plain account digits and balances', () => {
  assert.equal(
    redactSms('Dear Parthiban, Rs.450 debited from a/c no. 1234 to ravi.k@okicici. Avl Bal Rs 10,234.50'),
    'Dear customer, Rs.450 debited from a/c no. XX#### to ****@okicici. Avl Bal Rs ####'
  );
  assert.equal(redactSms('INR 2,000.00 spent on HDFC Bank Card ending 5678 at AMAZON'), 'INR 2,000.00 spent on HDFC Bank Card ending XX#### at AMAZON');
  assert.equal(redactSms('Hi Ravi Kumar: Rs 99 paid'), 'Dear customer: Rs 99 paid');
});

test('looksLikeTxn skips OTPs and amount-less texts', () => {
  assert.ok(looksLikeTxn('INR 500 moved to your wallet by Paytm'));
  assert.ok(!looksLikeTxn('Your OTP for Rs 500 payment is 123456'));
  assert.ok(!looksLikeTxn('Hello, your statement is ready'));
});

test('readAiDraft maps names and validates fields', () => {
  const reply = JSON.stringify({ type: 'expense', amount: '450', account: 'hdfc savings', category: 'Food & Dining', merchant: 'Swiggy', date: '2026-11-03' });
  assert.deepEqual(readAiDraft(reply, ['HDFC Savings', 'Cash'], cats), {
    type: 'expense', amount: 450, account: 'HDFC Savings', toAccount: null, category: 'Food & Dining', merchant: 'Swiggy', note: null, date: '03/11/2026',
  });
  const bad = readAiDraft(JSON.stringify({ type: 'gift', amount: -1, account: 'SBI', date: '3 Nov' }), ['Cash'], cats);
  assert.equal(bad.type, 'expense');
  assert.equal(bad.amount, null);
  assert.equal(bad.account, null);
  assert.equal(bad.date, null);
});

test('readAiPicks keeps in-range non-empty values once', () => {
  const picks = readAiPicks(JSON.stringify({ items: [{ i: 0, value: ' Swiggy ' }, { i: 0, value: 'X' }, { i: 5, value: 'Y' }, { i: 1, value: '' }] }), 2);
  assert.deepEqual([...picks], [[0, 'Swiggy']]);
});

test('readAiSuggestion keeps only names from the lists', () => {
  const r = readAiSuggestion(
    JSON.stringify({ category: 'subscriptions', tags: ['business', 'Made Up', 'Business', 'Tax saving', 'Shared', 'Reimbursable'] }),
    ['Subscriptions', 'Food & Dining'],
    ['Business', 'Tax saving', 'Shared', 'Reimbursable']
  );
  assert.deepEqual(r, { category: 'Subscriptions', tags: ['Business', 'Tax saving', 'Shared'] });
  assert.deepEqual(readAiSuggestion('{"category": null}', ['A'], ['B']), { category: null, tags: [] });
  // One new tag is allowed; a category name or an over-long label is not.
  assert.deepEqual(readAiSuggestion('{"category": "A", "tags": [], "new_tag": " #Work tools "}', ['A'], ['B']).tags, ['Work tools']);
  assert.deepEqual(readAiSuggestion('{"tags": [], "new_tag": "a"}', ['A'], ['B']).tags, []);
  assert.deepEqual(readAiSuggestion('{"tags": ["B"], "new_tag": "b"}', ['A'], ['B']).tags, ['B']);
});
