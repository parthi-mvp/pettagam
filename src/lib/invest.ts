import type { Investment, InvestmentType } from '@/db/types';

import type { Compounding } from './holding';
import type { Schedule } from './schedule';

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

// ---- Per-type plan details (stored in investments.details next to the price link) ----

/** FD-like interest: kept and compounded (cumulative), or paid out to your bank. */
export type Payout = 'cumulative' | 'monthly' | 'quarterly' | 'yearly';
export const PAYOUTS: { value: Payout; label: string }[] = [
  { value: 'cumulative', label: 'At maturity' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];
export type Purity = '24K' | '22K' | '18K';
export type PlanDetails = { payout?: Payout; schedule?: Schedule; purity?: Purity; taxSaver?: boolean };

export const hasPayoutMode = is('fd', 'corporate_fd', 'po_td');
export const hasPurity = is('gold');

const SCHEDULE: Partial<Record<InvestmentType, { label: string; every: Schedule['every'][] }>> = {
  rd: { label: 'Monthly installment', every: [1] },
  mutual_fund: { label: 'SIP', every: [1, 3] },
  etf: { label: 'SIP', every: [1] },
  digital_gold: { label: 'SIP', every: [1] },
  lic: { label: 'Premium', every: [1, 3, 6, 12] },
  ulip: { label: 'Premium', every: [1, 3, 6, 12] },
  apy: { label: 'Contribution', every: [1, 3, 6] },
  nps: { label: 'Contribution', every: [1, 12] },
  ppf: { label: 'Regular deposit', every: [1, 12] },
  ssy: { label: 'Regular deposit', every: [1, 12] },
};
/** "SIP", "Premium"…: the regular payment this type has, and how often it can be. */
export const scheduleOf = (t: InvestmentType) => SCHEDULE[t] ?? null;
export const EVERY_LABEL: Record<Schedule['every'], string> = { 1: 'Monthly', 3: 'Quarterly', 6: 'Half-yearly', 12: 'Yearly' };

/** Tax-saving variants and their lock-in: 5-year tax-saver FD, ELSS fund (3 years per installment). */
export const taxSaverOf = (t: InvestmentType) => (t === 'fd' ? { label: 'Tax-saver FD (5-year lock-in, 80C)', years: 5 } : t === 'mutual_fund' ? { label: 'ELSS tax saver (3-year lock-in, 80C)', years: 3 } : null);

/** PPF / SSY close for the year without this much paid in by 31 March. */
export const yearlyMinimum = (t: InvestmentType) => (t === 'ppf' ? 500 : t === 'ssy' ? 250 : null);

/** The interest growth to use: FD-like deposits that pay interest out don't compound. */
export function compoundingFor(inv: Pick<Investment, 'type' | 'details'>): Compounding | null {
  const payout = parseDetails<PlanDetails>(inv).payout;
  if (hasPayoutMode(inv.type) && payout && payout !== 'cumulative') return 'none';
  return compoundingOf(inv.type);
}
