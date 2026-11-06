import type { SQLiteDatabase } from 'expo-sqlite';
import { toast } from 'sonner-native';

import { aiSmsReady } from '@/ai/client';
import { aiReadSms, aiSuggestCategoryAndTags } from '@/ai/features';
import { emitChange } from '@/db/events';
import { getSetting, listAccounts, listCategories, save, setSetting, smsTransactionId } from '@/db/repo';
import { ensureCashAccount } from '@/db/cash';
import { seedCategoryId } from '@/db/schema';
import { isCardLike, type Account, type Category, type Transaction } from '@/db/types';

import { bankFromSender, matchBank } from '@/catalog/banks';
import { networkFromText } from '@/catalog/networks';
import { tagsColumn } from '@/lib/tags';

import { isPaymentTwin, learnedCategory, matchAccount, paymentSource, PAYMENT_TWIN_MS, type PastCategory } from './match';
import { findLast4, isAtmWithdrawal, isCardPayment, looksLikeTxn, parseSms, paymentMethod, smsHash, type ParsedSms, type RawSms } from './parser';

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

/**
 * An SMS with no account digits ("You have done a UPI txn. Rs 120 debited to VPA …"): the sender's bank
 * (AD-HDFCBK → HDFC) picks your account there, but only if you have exactly one. Never for card alerts,
 * and never when the SMS quoted digits that didn't match (those belong to an account you haven't added).
 */
function senderAccount(accounts: Account[], sms: RawSms, p: Pick<ParsedSms, 'instrument' | 'last4'>) {
  if (p.last4 || p.instrument === 'card') return undefined;
  const bank = bankFromSender(sms.address);
  if (!bank) return undefined;
  const mine = accounts.filter((a) => (a.type === 'bank' || a.type === 'overdraft') && matchBank(a.institution)?.id === bank.id);
  return mine.length === 1 ? mine[0] : undefined;
}

/** Your last choice for this merchant beats the keyword rules; the AI only sees what both miss. */
function pickCategory(p: ParsedSms, history: PastCategory[], catIds: Set<string>) {
  const rule = p.categoryHint ? seedCategoryId(p.categoryHint) : null;
  const ruleId = rule && catIds.has(rule) ? rule : null;
  const learnedId = p.atm ? null : learnedCategory(history, p.merchant, p.type);
  return { learnedId, ruleId, categoryId: learnedId ?? ruleId };
}

/** Card bills already recorded (transfers into a card), to spot the second alert for the same payment. */
const recordedCardPayments = (db: SQLiteDatabase) =>
  db.getAllAsync<{ amount: number; date: number }>(
    "SELECT t.amount, t.date FROM transactions t JOIN accounts a ON a.id = t.to_account_id WHERE t.deleted = 0 AND t.type = 'transfer' AND a.type IN ('credit_card', 'pay_later')"
  );

export type SmsExplain = {
  parsed: ParsedSms | null;
  /** The rules couldn't read it: would it still go to the AI (has an amount, isn't an OTP / promo)? */
  looksLikeTxn: boolean;
  learnedId: string | null;
  ruleId: string | null;
  categoryId: string | null;
  accountId: string | null;
  /** How the account was found: the digits in the SMS, or the sender's bank (no digits in the SMS). */
  accountBy: 'digits' | 'sender' | null;
  senderBank: string | null;
  /** A card network the text names ("VISA Card"), which would fill in the account's network. */
  network: string | null;
  /** What gets saved: expense / income, a transfer (ATM → Cash, card bill bank → card), or skipped. */
  saveAs: 'expense' | 'income' | 'transfer to Cash' | 'transfer bank → card' | 'skipped (duplicate payment)' | 'skipped (already imported)' | null;
  alreadyImported: boolean;
  paymentTwin: boolean;
};

/**
 * Developer tools: everything the import decides about one SMS, step by step: reading, account,
 * category, payment method, duplicates. No AI, nothing saved; already-imported messages can be tested.
 */
export async function explainSms(db: SQLiteDatabase, sms: RawSms): Promise<SmsExplain> {
  const [accounts, categories, history, payments, imported] = await Promise.all([
    listAccounts(db),
    listCategories(db),
    pastCategories(db),
    recordedCardPayments(db),
    db.getFirstAsync('SELECT 1 FROM transactions WHERE sms_hash = ?', [smsHash(sms)]),
  ]);
  const parsed = parseSms(sms);
  const senderBank = bankFromSender(sms.address)?.name ?? null;
  const network = networkFromText(sms.body);
  const empty = { learnedId: null, ruleId: null, categoryId: null, accountId: null, accountBy: null, saveAs: null, paymentTwin: false } as const;
  if (!parsed) return { parsed: null, looksLikeTxn: looksLikeTxn(sms.body), senderBank, network, alreadyImported: imported != null, ...empty };
  const byDigits = matchAccount(accounts, parsed);
  const account = byDigits ?? senderAccount(accounts, sms, parsed);
  const paysCard = parsed.cardPayment && account && isCardLike(account.type);
  const bankSide = parsed.type === 'expense' && !parsed.atm && account && !isCardLike(account.type);
  const paymentTwin = !!(paysCard || bankSide) && isPaymentTwin(payments, parsed.amount, sms.date);
  const saveAs: SmsExplain['saveAs'] =
    imported != null
      ? 'skipped (already imported)'
      : paymentTwin
        ? 'skipped (duplicate payment)'
        : paysCard
          ? 'transfer bank → card'
          : parsed.atm
            ? 'transfer to Cash'
            : parsed.type;
  return {
    parsed,
    looksLikeTxn: true,
    ...pickCategory(parsed, history, new Set(categories.map((c) => c.id))),
    accountId: account?.id ?? null,
    accountBy: byDigits ? 'digits' : account ? 'sender' : null,
    senderBank,
    network,
    saveAs,
    alreadyImported: imported != null,
    paymentTwin,
  };
}

/** Also used by "paste SMS" on iOS / when the native module isn't available. */
export async function buildCandidates(db: SQLiteDatabase, inbox: RawSms[], opts: { ai?: boolean } = {}): Promise<SmsCandidate[]> {
  const [accounts, categories, existing, history, payments] = await Promise.all([
    listAccounts(db),
    listCategories(db),
    db.getAllAsync<{ sms_hash: string }>('SELECT sms_hash FROM transactions WHERE sms_hash IS NOT NULL'),
    pastCategories(db),
    recordedCardPayments(db),
  ]);
  const seen = new Set(existing.map((e) => e.sms_hash));
  const catIds = new Set(categories.map((c) => c.id));
  const out: SmsCandidate[] = [];
  const misses: RawSms[] = [];
  // The Home check passes ai: false: it runs on every open, and must cost nothing and send nothing.
  const useAi = (opts.ai ?? true) && aiSmsReady();
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
    const account = matchAccount(accounts, p) ?? senderAccount(accounts, sms, p);
    // One card payment, two alerts (the card's "payment received" and its "credited"), or the bank's own debit
    // for a payment already on the card: same money, so skip it.
    const paysCard = p.cardPayment && account && isCardLike(account.type);
    const bankSide = p.type === 'expense' && !p.atm && account && !isCardLike(account.type);
    if ((paysCard || bankSide) && isPaymentTwin(payments, p.amount, sms.date)) continue;
    if (paysCard) payments.push({ amount: p.amount, date: sms.date });
    out.push({
      ...p,
      sms,
      accountId: account?.id ?? null,
      categoryId: pickCategory(p, history, catIds).categoryId,
      selected: account != null,
    });
  }
  // Second pass: a bank debit read before its card's "payment received" alert in this same batch.
  const cardPays = out.filter((c) => c.cardPayment).map((c) => ({ amount: c.amount, date: c.sms.date }));
  const isBankTwin = (c: SmsCandidate) => {
    const acc = accounts.find((a) => a.id === c.accountId);
    return c.type === 'expense' && !c.atm && !!acc && !isCardLike(acc.type) && isPaymentTwin(cardPays, c.amount, c.sms.date);
  };
  if (cardPays.length) out.splice(0, out.length, ...out.filter((c) => !isBankTwin(c)));
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
        cardPayment: it.type === 'income' && isCardPayment(sms.body),
        via: paymentMethod(sms.body, findLast4(sms.body).instrument, it.type === 'expense' && isAtmWithdrawal(sms.body)),
        hash: smsHash(sms),
      };
      const account = matchAccount(accounts, p) ?? senderAccount(accounts, sms, p);
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
 * Learn from imported alerts:
 * - digits: when an alert quoted digits no account has and the user chose the account, remember them
 *   (a debit card's on a bank account, else the account's own), so the next alert matches by itself;
 * - network: a card alert that names it ("VISA Card XX8013", "RuPay Credit Card") fills in an
 *   account's network when it isn't set yet. A choice already made is never overwritten.
 */
async function learnDigits(db: SQLiteDatabase, imported: SmsCandidate[]) {
  const accounts = await listAccounts(db);
  const learned = new Set<string>();
  for (const c of imported) {
    if (!c.accountId || learned.has(c.accountId)) continue;
    const a = accounts.find((x) => x.id === c.accountId);
    if (!a) continue;
    const bank = a.type === 'bank' || a.type === 'overdraft';
    const digits =
      !c.last4 || matchAccount(accounts, c)
        ? null
        : c.instrument === 'card' && bank && !a.card_last4
          ? { card_last4: c.last4 }
          : !a.last4
            ? { last4: c.last4 }
            : null;
    const network = !a.network && c.instrument === 'card' ? networkFromText(c.sms.body) : null;
    if (!digits && !network) continue;
    const { created_at: _c, updated_at: _u, deleted: _d, ...row } = a;
    await save(db, 'accounts', { ...row, ...digits, ...(network ? { network } : null) }, { silent: true });
    learned.add(a.id);
  }
  if (learned.size) emitChange('accounts');
}

export async function importCandidates(db: SQLiteDatabase, items: SmsCandidate[]) {
  let n = 0;
  // ATM withdrawals move money into Cash; created only if one is being imported.
  const cashId = items.some((c) => c.selected && c.accountId && c.atm) ? await ensureCashAccount(db) : null;
  const accounts = await listAccounts(db);
  for (const c of items) {
    if (!c.selected || !c.accountId) continue;
    if (c.cardPayment && (await importCardPayment(db, c, accounts))) {
      n++;
      continue;
    }
    const atm = c.atm && cashId && c.accountId !== cashId;
    await save(
      db,
      'transactions',
      {
        id: smsTransactionId(c.hash),

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
        via: c.atm ? 'atm' : c.via,
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
 * A card bill payment is money moving from a bank to the card, never income. If the bank's own debit is
 * already here (e.g. "Sent … To CRED Club", imported as spending), that entry becomes the transfer;
 * otherwise a transfer from the likeliest bank account is added. False when there's no bank to pay from
 * (the caller then saves it as before).
 */
async function importCardPayment(db: SQLiteDatabase, c: SmsCandidate, accounts: Account[]) {
  const card = accounts.find((a) => a.id === c.accountId);
  if (!card || !isCardLike(card.type)) return false;
  const bankIds = accounts.filter((a) => !isCardLike(a.type)).map((a) => a.id);
  const debit = bankIds.length
    ? await db.getFirstAsync<Transaction>(
        `SELECT * FROM transactions WHERE deleted = 0 AND type = 'expense' AND ABS(amount - ?) < 0.005 AND ABS(date - ?) <= ?
           AND account_id IN (${bankIds.map(() => '?').join(',')}) ORDER BY ABS(date - ?) LIMIT 1`,
        [c.amount, c.sms.date, PAYMENT_TWIN_MS, ...bankIds, c.sms.date]
      )
    : null;
  if (debit) {
    const { created_at: _c, updated_at: _u, deleted: _d, ...row } = debit;
    await save(db, 'transactions', { ...row, type: 'transfer', to_account_id: card.id, category_id: null }, { silent: true });
    return true;
  }
  const from = paymentSource(accounts, card);
  if (!from) return false;
  await save(
    db,
    'transactions',
    {
      id: smsTransactionId(c.hash),

      account_id: from.id,
      to_account_id: card.id,
      type: 'transfer',
      amount: c.amount,
      category_id: null,
      date: c.sms.date,
      merchant: c.merchant,
      note: c.sms.body.slice(0, 200),
      source: 'sms',
      sms_hash: c.hash,
      tags: tagsColumn(c.tags ?? []),
      via: null,
    },
    { silent: true }
  );
  return true;
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
