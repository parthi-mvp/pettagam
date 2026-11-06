import type { Investment, InvestmentType } from '@/db/types';

import type { Compounding } from './holding';

export type { ChitDetails } from './chit';

export function parseDetails<T = Record<string, unknown>>(inv: Pick<Investment, 'details'>): T {
  try {
    return (inv.details ? JSON.parse(inv.details) : {}) as T;
  } catch {
    return {} as T;
  }
}

/** FD value today with quarterly compounding (typical for Indian bank FDs). */
export function fdAccruedValue(principal: number, ratePct: number, startMs: number, now = Date.now(), maturityMs?: number | null) {
  const end = maturityMs ? Math.min(now, maturityMs) : now;
  const years = Math.max(0, (end - startMs) / (365.25 * 86_400_000));
  return principal * Math.pow(1 + ratePct / 100 / 4, 4 * years);
}

/** Entry kind that represents putting money in, per investment type. */
const is = (...types: InvestmentType[]) => (t: InvestmentType) => types.includes(t);

/** Paid in instalments: RD, chit, provident funds, pensions, premiums. */
const CONTRIBUTION = is('rd', 'chit', 'ppf', 'epf', 'nps', 'ssy', 'apy', 'lic', 'ulip');
export const defaultInflowKind = (t: InvestmentType) => (CONTRIBUTION(t) ? 'contribution' : 'buy');

export const usesUnits = is('stock', 'mutual_fund', 'gold', 'crypto', 'etf', 'reit', 'invit', 'us_stock', 'esop', 'digital_gold', 'sgb', 'silver');
/** Quantity is in grams, not units. */
export const usesGrams = is('gold', 'digital_gold', 'silver');
export const usesRate = is('fd', 'rd', 'ppf', 'epf', 'bond', 'corporate_fd', 'po_td', 'po_mis', 'nsc', 'kvp', 'scss', 'ssy');
export const usesMaturity = is('fd', 'rd', 'bond', 'chit', 'ppf', 'corporate_fd', 'po_td', 'po_mis', 'nsc', 'kvp', 'scss', 'ssy', 'sgb', 'lic', 'ulip');
/** Lump sum compounding quarterly: gets the "≈ value today" estimate. */
export const isFdLike = is('fd', 'corporate_fd', 'po_td');


/** How each type's interest grows, for its live estimate (src/lib/holding.ts). Pay-out schemes stay at principal. */
export const compoundingOf = (t: InvestmentType): Compounding | null =>
  is('fd', 'corporate_fd', 'po_td', 'rd')(t) ? 'quarterly' : is('ppf', 'epf', 'ssy', 'nsc', 'kvp')(t) ? 'yearly' : null;

/** Market price lookups this app can make (src/invest/prices.ts). */
export type PriceLink = { mfScheme?: number; coinId?: string; symbol?: string; livePrice?: number; livePriceAt?: number };
