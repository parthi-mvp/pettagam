import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPaymentTwin, learnedCategory, matchAccount, paymentSource, type PastCategory } from '../src/sms/match.ts';

const acc = (id: string, type: string, last4: string | null, card_last4: string | null = null) =>
  ({ id, type, last4, card_last4 }) as never;

const hdfcSavings = acc('hdfc', 'bank', '9642', '5678');
const iciciCard = acc('icici-cc', 'credit_card', '5678');
const kvb = acc('kvb', 'bank', '1111');

test('ATM alert quoting the debit card matches the bank account', () => {
  const m = matchAccount([hdfcSavings, kvb], { last4: '5678', instrument: 'card', atm: true });
  assert.equal(m?.id, 'hdfc');
});

test('ATM prefers the bank account when a credit card shares the digits', () => {
  const m = matchAccount([iciciCard, hdfcSavings], { last4: '5678', instrument: 'card', atm: true });
  assert.equal(m?.id, 'hdfc');
});

test('card spend with shared digits still prefers the credit card', () => {
  const m = matchAccount([hdfcSavings, iciciCard], { last4: '5678', instrument: 'card', atm: false });
  assert.equal(m?.id, 'icici-cc');
});

test('account digits still match, unknown digits do not', () => {
  assert.equal(matchAccount([hdfcSavings, kvb], { last4: '9642', instrument: 'account', atm: false })?.id, 'hdfc');
  assert.equal(matchAccount([hdfcSavings, kvb], { last4: '0000', instrument: 'card', atm: true }), undefined);
});

test('learnedCategory: same merchant, newest first, same kind', () => {
  const history: PastCategory[] = [
    { merchant: 'Anthropic', category_id: 'subs', kind: 'expense' },
    { merchant: 'Swiggy', category_id: 'food', kind: 'expense' },
    { merchant: 'swiggy', category_id: 'old', kind: 'expense' },
    { merchant: 'ACME Corp', category_id: 'salary', kind: 'income' },
    { merchant: 'Sri Krishna Sweets', category_id: 'food', kind: 'expense' },
  ];
  assert.equal(learnedCategory(history, 'SWIGGY', 'expense'), 'food');
  assert.equal(learnedCategory(history, 'ANTHROPIC* CLAUDE SUB', 'expense'), 'subs');
  assert.equal(learnedCategory(history, 'ACME Corp', 'expense'), null); // income history doesn't apply to a spend
  assert.equal(learnedCategory(history, 'Sri Murugan Stores', 'expense'), null); // "sri" is too short to match on
  assert.equal(learnedCategory(history, 'Zomato', 'expense'), null);
  assert.equal(learnedCategory(history, null, 'expense'), null);
});

test('paymentSource prefers a bank account at the card’s own bank', () => {
  const a = (id: string, type: string, institution: string | null) => ({ id, type, institution }) as never;
  const sbi = a('sbi', 'bank', 'State Bank of India');
  const hdfc = a('hdfc', 'bank', 'HDFC Bank');
  const card = a('card', 'credit_card', 'Hdfc');
  assert.equal(paymentSource([sbi, hdfc, card], card)?.id, 'hdfc');
  assert.equal(paymentSource([sbi, card], card)?.id, 'sbi'); // no HDFC account: the first bank
  assert.equal(paymentSource([card], card), undefined);
});

test('isPaymentTwin: same amount within 3 days', () => {
  const day = 86_400_000;
  const seen = [{ amount: 341517, date: 10 * day }];
  assert.equal(isPaymentTwin(seen, 341517, 11 * day), true);
  assert.equal(isPaymentTwin(seen, 341517, 14 * day), false);
  assert.equal(isPaymentTwin(seen, 341518, 10 * day), false);
});
