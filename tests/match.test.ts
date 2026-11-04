import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchAccount } from '../src/sms/match.ts';

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
