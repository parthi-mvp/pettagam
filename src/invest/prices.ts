import type { SQLiteDatabase } from 'expo-sqlite';

import { recomputeInvested } from '@/db/investments';
import { getSetting, listInvestments, save, setSetting } from '@/db/repo';
import type { Investment } from '@/db/types';
import { parseDetails, type PriceLink } from '@/lib/invest';

/**
 * Market prices, fetched from the phone (no server of ours). Only the fund code or coin id is sent,
 * never amounts or holdings.
 *  - Mutual funds: mfapi.in, a free JSON view of AMFI's official daily NAV (end of day).
 *  - Crypto: CoinGecko's public API, in rupees.
 * Stocks and gold have no free official source, so their price is entered by hand.
 */

const TIMEOUT_MS = 10_000;
/** Look again at most this often (NAV changes once a day; crypto more often, but this isn't a trading app). */
const EVERY_MS = 30 * 60_000;

async function getJson<T>(url: string): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Price lookup ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export type FundMatch = { code: number; name: string };
export const searchFunds = async (q: string): Promise<FundMatch[]> =>
  (await getJson<{ schemeCode: number; schemeName: string }[]>(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`))
    .slice(0, 30)
    .map((x) => ({ code: x.schemeCode, name: x.schemeName }));

export type CoinMatch = { id: string; name: string; symbol: string };
export const searchCoins = async (q: string): Promise<CoinMatch[]> =>
  (await getJson<{ coins: { id: string; name: string; symbol: string }[] }>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`)).coins
    .slice(0, 20)
    .map((c) => ({ id: c.id, name: c.name, symbol: c.symbol }));

/** "05-11-2026" → that day's local midnight. */
const navDate = (s: string) => {
  const [d, m, y] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

async function fundNav(code: number): Promise<{ price: number; at: number } | null> {
  const r = await getJson<{ data?: { date: string; nav: string }[] }>(`https://api.mfapi.in/mf/${code}/latest`);
  const row = r.data?.[0];
  const price = row ? Number(row.nav) : NaN;
  return row && price > 0 ? { price, at: navDate(row.date) } : null;
}

async function coinPrices(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const r = await getJson<Record<string, { inr?: number }>>(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=inr`);
  return Object.fromEntries(Object.entries(r).flatMap(([id, v]) => (v.inr ? [[id, v.inr]] : [])));
}

/** Whether this investment's price can be looked up. */
export const hasLivePrice = (inv: Investment) => {
  const l = parseDetails<PriceLink>(inv);
  return !!(l.mfScheme || l.coinId);
};

async function setPrice(db: SQLiteDatabase, inv: Investment, price: number, at: number) {
  const link = parseDetails<PriceLink>(inv);
  if (link.livePrice === price && link.livePriceAt === at) return;
  const { id: _i, created_at: _c, updated_at: _u, deleted: _d, ...rest } = inv;
  await save(db, 'investments', { ...rest, id: inv.id, details: JSON.stringify({ ...link, livePrice: price, livePriceAt: at }) }, { silent: true });
  await recomputeInvested(db, inv.id);
}

let running: Promise<number> | null = null;

/**
 * Fetch prices for every linked fund and coin and revalue them. At most every 30 minutes unless
 * `force`; offline or a failed lookup leaves the last price in place. Returns how many were updated.
 */
export function refreshPrices(db: SQLiteDatabase, force = false): Promise<number> {
  running ??= (async () => {
    const last = Number((await getSetting(db, 'prices_at')) ?? 0);
    if (!force && Date.now() - last < EVERY_MS) return 0;
    const all = (await listInvestments(db)).filter(hasLivePrice);
    let n = 0;
    const funds = all.filter((i) => parseDetails<PriceLink>(i).mfScheme);
    for (const inv of funds) {
      const nav = await fundNav(parseDetails<PriceLink>(inv).mfScheme!).catch(() => null);
      if (nav) {
        await setPrice(db, inv, nav.price, nav.at);
        n++;
      }
    }
    const coins = all.filter((i) => parseDetails<PriceLink>(i).coinId);
    const prices = await coinPrices([...new Set(coins.map((i) => parseDetails<PriceLink>(i).coinId!))]).catch(() => ({}) as Record<string, number>);
    for (const inv of coins) {
      const p = prices[parseDetails<PriceLink>(inv).coinId!];
      if (p) {
        await setPrice(db, inv, p, Date.now());
        n++;
      }
    }
    await setSetting(db, 'prices_at', String(Date.now()));
    return n;
  })().finally(() => {
    running = null;
  });
  return running;
}
