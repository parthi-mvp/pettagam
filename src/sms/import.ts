import type { SQLiteDatabase } from 'expo-sqlite';
import { toast } from 'sonner-native';

import { aiSmsReady } from '@/ai/client';
import { aiReadSms, aiSuggestCategoryAndTags } from '@/ai/features';
import { emitChange } from '@/db/events';
import { getSetting, listAccounts, listCategories, save, setSetting } from '@/db/repo';
import { ensureCashAccount } from '@/db/cash';
import { seedCategoryId } from '@/db/schema';
import type { Account, Category } from '@/db/types';

import { tagsColumn } from '@/lib/tags';

import { learnedCategory, matchAccount, type PastCategory } from './match';
import { findLast4, isAtmWithdrawal, looksLikeTxn, parseSms, smsHash, type ParsedSms, type RawSms } from './parser';

export type SmsCandidate = ParsedSms & {
  sms: RawSms;
  accountId: string | null; // matched by last 4 digits
  categoryId: string | null;
  selected: boolean;
  ai?: boolean; // read or categorised by the AI
  tags?: string[]; // picked on the review card
};

/** The category each merchant last got, newest first, so imports repeat your own choices. */
const pastCategories = (db: SQLiteDatabase) =>
  db.getAllAsync<PastCategory>(
    `SELECT t.merchant, t.category_id, c.kind FROM transactions t
     JOIN categories c ON c.id = t.category_id AND c.deleted = 0
     WHERE t.deleted = 0 AND t.merchant IS NOT NULL AND t.type IN ('expense', 'income')
     ORDER BY t.date DESC LIMIT 5000`
  );

/** Your last choice for this merchant beats the keyword rules; the AI only sees what both miss. */
function pickCategory(p: ParsedSms, history: PastCategory[], catIds: Set<string>) {
  const rule = p.categoryHint ? seedCategoryId(p.categoryHint) : null;
  const ruleId = rule && catIds.has(rule) ? rule : null;
  const learnedId = p.atm ? null : learnedCategory(history, p.merchant, p.type);
  return { learnedId, ruleId, categoryId: learnedId ?? ruleId };
}

export type SmsExplain = { parsed: ParsedSms | null; learnedId: string | null; ruleId: string | null; categoryId: string | null; accountId: string | null };

/**
 * Developer tools: what the import would make of one SMS, step by step. No AI, no duplicate check
 * (old, already-imported messages can be tested too), nothing saved.
 */
export async function explainSms(db: SQLiteDatabase, sms: RawSms): Promise<SmsExplain> {
  const [accounts, categories, history] = await Promise.all([listAccounts(db), listCategories(db), pastCategories(db)]);
  const parsed = parseSms(sms);
  if (!parsed) return { parsed: null, learnedId: null, ruleId: null, categoryId: null, accountId: null };
  return { parsed, ...pickCategory(parsed, history, new Set(categories.map((c) => c.id))), accountId: matchAccount(accounts, parsed)?.id ?? null };
}

/** Also used by "paste SMS" on iOS / when the native module isn't available. */
export async function buildCandidates(db: SQLiteDatabase, inbox: RawSms[]): Promise<SmsCandidate[]> {
  const [accounts, categories, existing, history] = await Promise.all([
    listAccounts(db),
    listCategories(db),
    db.getAllAsync<{ sms_hash: string }>('SELECT sms_hash FROM transactions WHERE sms_hash IS NOT NULL'),
    pastCategories(db),
  ]);
  const seen = new Set(existing.map((e) => e.sms_hash));
  const catIds = new Set(categories.map((c) => c.id));
  const out: SmsCandidate[] = [];
  const misses: RawSms[] = [];
  const useAi = aiSmsReady();
  for (const sms of inbox) {
    const p = parseSms(sms);
    if (!p) {
      const h = smsHash(sms);
      if (useAi && !seen.has(h) && looksLikeTxn(sms.body)) {
        seen.add(h);
        misses.push(sms);
      }
      continue;
    }
    if (seen.has(p.hash)) continue;
    seen.add(p.hash);
    const account = matchAccount(accounts, p);
    out.push({
      ...p,
      sms,
      accountId: account?.id ?? null,
      categoryId: pickCategory(p, history, catIds).categoryId,
      selected: account != null,
    });
  }
  // AI is best-effort: on failure keep the rule-based results and say why.
  if (useAi) await aiFill(out, misses, accounts, categories, history).catch((e) => toast.error(`AI skipped: ${e instanceof Error ? e.message : e}`));
  return out;
}

/** Ask the AI about messages the rules couldn't read, and for categories the rules couldn't guess. */
async function aiFill(out: SmsCandidate[], misses: RawSms[], accounts: Account[], categories: Category[], history: PastCategory[]) {
  const uncategorised = out.filter((c) => !c.categoryId);
  const batch = [...misses, ...uncategorised.map((c) => c.sms)];
  if (!batch.length) return;
  const items = await aiReadSms(
    batch.map((s) => s.body),
    categories.map((c) => ({ name: c.name, kind: c.kind })),
  );
  const catId = (name: string | null, type: string) => categories.find((c) => c.name === name && c.kind === type)?.id ?? null;
  for (const it of items) {
    if (it.i < misses.length) {
      const sms = misses[it.i];
      const p: ParsedSms = {
        ...findLast4(sms.body),
        type: it.type,
        amount: it.amount,
        merchant: it.merchant,
        balance: null,
        categoryHint: it.category,
        atm: it.type === 'expense' && isAtmWithdrawal(sms.body),
        hash: smsHash(sms),
      };
      const account = matchAccount(accounts, p);
      const learned = p.atm ? null : learnedCategory(history, it.merchant, it.type);
      out.push({ ...p, sms, accountId: account?.id ?? null, categoryId: learned ?? catId(it.category, it.type), selected: account != null, ai: true });
    } else {
      const c = uncategorised[it.i - misses.length];
      const id = it.type === c.type ? catId(it.category, c.type) : null;
      if (id) Object.assign(c, { categoryId: id, ai: true });
    }
  }
  if (misses.length) out.sort((a, b) => b.sms.date - a.sms.date);
}

/**
 * Ask the AI about one SMS the user is reviewing (they tapped "Ask AI", so this one message is sent,
 * redacted). Returns its tags from `tagNames`, and a category id only when the SMS has none yet.
 */
export async function aiTagSms(c: SmsCandidate, categories: Category[], tagNames: string[]) {
  const mine = categories.filter((x) => x.kind === c.type);
  const r = await aiSuggestCategoryAndTags([c.merchant, c.sms.body].filter(Boolean).join(' '), c.type, mine.map((x) => x.name), tagNames);
  const categoryId = c.categoryId ? null : (mine.find((x) => x.name === r.category)?.id ?? null);
  return { tags: r.tags, categoryId };
}

/**
 * Learn from a manual pick: when an alert quoted digits no account has and the user chose the
 * account, remember them (a debit card's on a bank account, else the account's own), so the next
 * alert with those digits matches by itself.
 */
async function learnDigits(db: SQLiteDatabase, imported: SmsCandidate[]) {
  const accounts = await listAccounts(db);
  const learned = new Set<string>();
  for (const c of imported) {
    if (!c.last4 || !c.accountId || learned.has(c.accountId) || matchAccount(accounts, c)) continue;
    const a = accounts.find((x) => x.id === c.accountId);
    if (!a) continue;
    const bank = a.type === 'bank' || a.type === 'overdraft';
    const patch = c.instrument === 'card' && bank && !a.card_last4 ? { card_last4: c.last4 } : !a.last4 ? { last4: c.last4 } : null;
    if (!patch) continue;
    const { id, type, name, institution, last4, card_last4, opening_balance, credit_limit, billing_day, notes } = a;
    await save(db, 'accounts', { id, type, name, institution, last4, card_last4, opening_balance, credit_limit, billing_day, notes, ...patch }, { silent: true });
    learned.add(a.id);
  }
  if (learned.size) emitChange('accounts');
}

export async function importCandidates(db: SQLiteDatabase, items: SmsCandidate[]) {
  let n = 0;
  // ATM withdrawals move money into Cash; created only if one is being imported.
  const cashId = items.some((c) => c.selected && c.accountId && c.atm) ? await ensureCashAccount(db) : null;
  for (const c of items) {
    if (!c.selected || !c.accountId) continue;
    const atm = c.atm && cashId && c.accountId !== cashId;
    await save(
      db,
      'transactions',
      {
        account_id: c.accountId,
        to_account_id: atm ? cashId : null,
        type: atm ? 'transfer' : c.type,
        amount: c.amount,
        category_id: atm ? null : c.categoryId,
        date: c.sms.date,
        merchant: c.merchant,
        note: c.sms.body.slice(0, 200),
        source: 'sms',
        sms_hash: c.hash,
        tags: tagsColumn(c.tags ?? []),
      },
      { silent: true }
    );
    n++;
  }
  await learnDigits(db, items.filter((c) => c.selected && c.accountId));
  emitChange('transactions');
  return n;
}

/**
 * Move "since last import" forward after a scan that started at or before it. A scan of an older,
 * separate window (e.g. "Last month" after a long gap) leaves it alone, so the gap is still covered.
 */
export async function advanceSmsCursor(db: SQLiteDatabase, inbox: { date: number }[], from: number) {
  const cursor = Number((await getSetting(db, 'sms_cursor')) ?? 0);
  if (cursor > 0 && from > cursor) return;
  const latest = inbox.reduce((m, s) => Math.max(m, s.date), 0);
  if (latest > cursor) await setSetting(db, 'sms_cursor', String(latest));
}
