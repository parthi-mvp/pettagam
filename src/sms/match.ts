// Type imports only, so tests/match.test.ts can run this in Node.
import type { Account } from '@/db/types';

import type { ParsedSms } from './parser';

// Same rule as isCardLike in src/db/types.ts (a value import would break the Node test).
const isCardLike = (t: Account['type']) => t === 'credit_card' || t === 'pay_later';

/** The account an alert is about: its account digits, or a bank account's debit card digits. */
export function matchAccount(accounts: Account[], p: Pick<ParsedSms, 'last4' | 'instrument' | 'atm'>): Account | undefined {
  if (!p.last4) return undefined;
  const matches = accounts.filter((a) => a.last4?.slice(-4) === p.last4 || a.card_last4 === p.last4);
  if (matches.length <= 1) return matches[0];
  // ATM cash comes out of the bank account, even when a credit card shares the digits.
  if (p.atm) return matches.find((a) => !isCardLike(a.type)) ?? matches[0];
  // Otherwise prefer the instrument the SMS mentions.
  return matches.find((a) => (p.instrument === 'card') === isCardLike(a.type)) ?? matches[0];
}

/** "ANTHROPIC* CLAUDE SUB" → "anthropic claude sub": case and punctuation don't count. */
export const merchantKey = (m: string) => m.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type PastCategory = { merchant: string; category_id: string; kind: 'expense' | 'income' };

/**
 * The category you last gave this merchant, from `history` (newest first), for the same kind.
 * Names match exactly, or when one is the start of the other at a word break ("anthropic" ~
 * "anthropic claude sub"), but only if the shorter one has 4+ letters, so "Sri" can't match every "Sri …" shop.
 */
export function learnedCategory(history: PastCategory[], merchant: string | null, kind: 'expense' | 'income'): string | null {
  if (!merchant) return null;
  const key = merchantKey(merchant);
  if (key.length < 2) return null;
  let prefix: string | null = null;
  for (const h of history) {
    if (h.kind !== kind) continue;
    const k = merchantKey(h.merchant);
    if (k === key) return h.category_id;
    const [short, long] = k.length < key.length ? [k, key] : [key, k];
    if (!prefix && short.length >= 4 && long.startsWith(`${short} `)) prefix = h.category_id;
  }
  return prefix;
}

/**
 * Where a card bill was most likely paid from: a bank account at the card's own bank, else the first
 * bank account. The review card shows it; the user can deselect. Undefined when there's no bank account.
 */
export function paymentSource(accounts: Account[], card: Account): Account | undefined {
  const banks = accounts.filter((a) => a.type === 'bank' || a.type === 'overdraft');
  const bankWord = (a: Account) => a.institution?.trim().toLowerCase().split(/\s+/)[0] ?? '';
  return banks.find((b) => bankWord(b) !== '' && bankWord(b) === bankWord(card)) ?? banks[0];
}

/** Banks often send two alerts for one card payment (on paying, and when it posts): same amount within 3 days. */
export const PAYMENT_TWIN_MS = 3 * 86_400_000;
export const isPaymentTwin = (seen: { amount: number; date: number }[], amount: number, date: number) =>
  seen.some((s) => Math.abs(s.amount - amount) < 0.005 && Math.abs(s.date - date) <= PAYMENT_TWIN_MS);
