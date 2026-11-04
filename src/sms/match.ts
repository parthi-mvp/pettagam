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
