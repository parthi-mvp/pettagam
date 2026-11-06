import { isSmsReadingAvailable, readInbox } from '@modules/sms-reader';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting } from '@/db/repo';

import { buildCandidates } from './import';

const DAY = 86_400_000;

export type PendingSms = {
  /** New transaction alerts not imported yet (duplicates and second card-payment alerts already left out). */
  count: number;
  /** Money out and in across them (ATM withdrawals and card bill payments are transfers, so not counted). */
  out: number;
  in: number;
  /** No import has run yet, so this looked at the last 30 days. */
  firstTime: boolean;
};

/**
 * What the next SMS import would bring in, for the Home screen: the inbox since the last import, read
 * with the import's own rules but no AI (it runs on every open). Null when SMS can't be read here
 * (iOS, Expo Go, or no permission yet: the Home then shows the plain import prompt instead).
 */
export async function pendingSms(db: SQLiteDatabase): Promise<PendingSms | null> {
  if (!isSmsReadingAvailable) return null;
  const cursor = Number((await getSetting(db, 'sms_cursor')) ?? 0);
  let inbox;
  try {
    inbox = await readInbox(cursor > 0 ? cursor : Date.now() - 30 * DAY, 300);
  } catch {
    return null; // no READ_SMS permission yet
  }
  const found = await buildCandidates(db, inbox, { ai: false });
  let out = 0;
  let inn = 0;
  for (const c of found) {
    if (c.atm || c.cardPayment) continue;
    if (c.type === 'expense') out += c.amount;
    else inn += c.amount;
  }
  return { count: found.length, out, in: inn, firstTime: cursor === 0 };
}
