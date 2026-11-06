// Parses Indian bank / credit-card / UPI transaction SMS into structured entries.
// Pure TypeScript with no imports so it can be unit-tested in Node (see tests/).

export type ParsedSms = {
  type: 'expense' | 'income';
  amount: number;
  last4: string | null; // account / card digits for matching an Account
  instrument: 'card' | 'account' | 'upi' | 'unknown';
  merchant: string | null;
  balance: number | null; // "Avl Bal" / "Avl Lmt" if present
  categoryHint: string | null; // matches a default category name
  /** Cash taken out at an ATM: imported as a transfer to Cash, not as spending. */
  atm: boolean;
  /** A credit card bill payment reaching the card: imported as a transfer from a bank, not as income. */
  cardPayment: boolean;
  /** How the money moved (UPI, card, NEFT…), shown on the entry. Null when the SMS doesn't say. */
  via: Via | null;
  hash: string; // dedupe key
};

const ATM_RE = /\batm\b|cash withdrawal|cash wdl|\batm ?wdl\b|\bnfs\b|withdrawn at|cash w\/d/i;
/** An ATM / cash withdrawal alert (a debit that moves money into your wallet, not spending). */
export const isAtmWithdrawal = (body: string) => ATM_RE.test(body) && !/\b(?:deposit(?:ed)?|credited)\b/i.test(body);

// "PAYMENT OF Rs. 341517.00 RECEIVED TOWARDS YOUR CREDIT CARD", "Payment of Rs 341517 was credited to your card ending 5267".
const CARD_PAYMENT_RE = /\bpayment\b.{0,80}?\b(?:received|credited)\b.{0,40}?\b(?:credit\s*)?card\b/i;
/** A bill payment arriving on a credit card (money moved from a bank, not earned). */
export const isCardPayment = (body: string) => CARD_PAYMENT_RE.test(body.replace(/\s+/g, ' '));

/** NEFT, IMPS, RTGS and net banking are one thing to a spender (bank to bank), so they share 'transfer'. */
export type Via = 'upi' | 'card' | 'transfer' | 'atm' | 'autopay' | 'cheque';

export const VIA_LABELS: Record<Via, string> = {
  upi: 'UPI',
  card: 'Card',
  transfer: 'Bank transfer',
  atm: 'ATM',
  autopay: 'Auto-debit',
  cheque: 'Cheque',
};

/** Label for a stored payment method, or null when not recorded. */
export const viaLabel = (via: string | null | undefined) => (via ? (VIA_LABELS[via as Via] ?? null) : null);

/** How an SMS says the money moved. First match wins: the specific rails before the generic "card". */
export function paymentMethod(body: string, instrument: ParsedSms['instrument'], atm: boolean): Via | null {
  const b = body.replace(/\s+/g, ' ');
  if (atm) return 'atm';
  if (/\bupi\b|\bvpa\b|@(?:ok\w+|ybl|ibl|axl|paytm|upi|apl|yapl)\b/i.test(b)) return 'upi';
  if (/\b(?:imps|neft|rtgs)\b|net ?banking/i.test(b)) return 'transfer';
  if (/\b(?:nach|ecs|e-?mandate|autopay|auto-?debit|standing instruction)\b/i.test(b)) return 'autopay';
  if (/\b(?:cheque|chq)\b/i.test(b)) return 'cheque';
  if (instrument === 'card') return 'card';
  return null;
}

export type RawSms = { id?: string; address: string; body: string; date: number };

const AMOUNT = String.raw`(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)`;
const amountRe = new RegExp(AMOUNT, 'i');
const balanceRe = new RegExp(
  String.raw`(?:avl\.?|avail(?:able)?\.?|a\/c|clear|total)?\s*(?:bal(?:ance)?|lmt|limit)\.?\s*(?:is|:|-)?\s*(?:rs\.?|inr|₹)\s*(-?[0-9][0-9,]*(?:\.[0-9]{1,2})?)`,
  'i'
);

const SKIP = [
  /\botp\b/i,
  /one[\s-]?time[\s-]?password/i,
  /verification code/i,
  /will be (?:debited|charged|credited)/i,
  /\bis due\b|due date|due on|min(?:imum)?\.? (?:amt|amount) due|total (?:amt|amount) due/i,
  /\brequest(?:ed)?\b.*\bcollect\b|has requested/i,
  /\b(?:declined|failed|unsuccessful|reversed? (?:is )?initiated)\b/i,
  /pre-?approved|offer|eligible for|apply now|win\b|cashback up to/i,
  /e-?mandate.*(?:registered|created)|autopay.*(?:registered|set up)/i,
];

const DEBIT_WORDS = /\b(debited|debit(?:ed)? by|spent|withdrawn|withdrawal|paid|sent|purchase|charged|debit|txn of|used at|dr\b)/i;
const CREDIT_WORDS = /\b(credited|received|deposited|refund(?:ed)?|reversed|credit(?:ed)? (?:to|in)|cr\b|payment of .* received)/i;

// First match wins, so specific rules sit above broad ones (tax refund before refund, recharge before bills).
const CATEGORY_RULES: [RegExp, string, 'expense' | 'income'][] = [
  [/salary|sal cr|payroll/i, 'Salary', 'income'],
  [/bonus|incentive/i, 'Bonus & Incentives', 'income'],
  [/pension/i, 'Pension', 'income'],
  [/it refund|income ?tax refund|cpc refund|tax refund/i, 'Tax Refund', 'income'],
  [/reimb/i, 'Reimbursements', 'income'],
  [/interest|int\.? ?pd|dividend|\bdiv\b/i, 'Interest & Dividends', 'income'],
  [/refund|cashback|reversal|reversed/i, 'Refund / Cashback', 'income'],
  [/advance tax|self assessment tax|income ?tax|tin-?nsdl|property tax|challan/i, 'Taxes', 'expense'],
  [/\blic\b|policybazaar|acko|star health|hdfc ergo|insurance|premium/i, 'Insurance', 'expense'],
  [/netflix|hotstar|prime video|spotify|youtube|sonyliv|zee5|apple\.com|google play|icloud|jiocinema/i, 'Subscriptions', 'expense'],
  [/recharge|airtel|jio|vodafone|\bvi\b|bsnl|broadband|act fibernet|hathway|excitel/i, 'Mobile & Internet', 'expense'],
  [/urban ?company|salon|parlour|lakme|naturals/i, 'Personal Care', 'expense'],
  [/firstcry|hamleys|daycare|creche/i, 'Family & Kids', 'expense'],
  [/supertails|heads up for tails|petsy|veterinary|\bvet\b/i, 'Pets', 'expense'],
  [/ferns|\bfnp\b|\bigp\b|giftcard|gift card/i, 'Gifts & Festivals', 'expense'],
  [/temple|devasthanam|tirumala|\bttd\b|donation|charity|trust/i, 'Religious & Charity', 'expense'],
  [/annual fee|late (?:payment )?fee|penal|finance charge|forex markup/i, 'Fees & Charges', 'expense'],
  [/swiggy|zomato|restaurant|cafe|domino|pizza|kfc|mcdonald|starbucks|eatsure/i, 'Food & Dining', 'expense'],
  [/bigbasket|blinkit|zepto|grofers|dmart|reliance ?fresh|more retail|instamart|jiomart|supermarket/i, 'Groceries', 'expense'],
  [/irctc|makemytrip|goibibo|indigo|air ?india|vistara|cleartrip|oyo|redbus|booking\.com|airbnb/i, 'Travel', 'expense'],
  [/petrol|fuel|hpcl|iocl|bpcl|indian ?oil|shell|uber|ola\b|rapido|metro|fastag|parking/i, 'Fuel & Transport', 'expense'],
  [/electricity|bescom|tneb|tangedco|msedcl|water|gas|indane|bharat ?gas|hp ?gas|dth|tata ?play|bill ?pay|bbps/i, 'Bills & Utilities', 'expense'],
  [/bookmyshow|pvr|inox|district|cinepolis/i, 'Entertainment', 'expense'],
  [/pharma|apollo|medplus|hospital|clinic|diagnostic|1mg|netmeds|pharmeasy|lab\b/i, 'Health', 'expense'],
  [/school|college|tuition|udemy|coursera|byju|fees/i, 'Education', 'expense'],
  [/\bemi\b|loan|nach|ecs/i, 'EMI & Loans', 'expense'],
  [/rent|nobroker|maintenance|society/i, 'Rent & Housing', 'expense'],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|croma|reliance digital|tata ?cliq|decathlon|ikea/i, 'Shopping', 'expense'],
];

export function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

/** FNV-1a 32-bit hash → hex. Stable across devices for dedupe. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function findLast4(body: string): { last4: string | null; instrument: ParsedSms['instrument'] } {
  const card = body.match(
    /(?:credit card|debit card|card|cc)\b(?:\s*(?:no\.?|number))?(?:\s*(?:ending|ending with|ends with|end))?\s*[:\-]?\s*[x*#.\s]*([0-9]{4,6})\b/i
  );
  if (card) return { last4: card[1].slice(-4), instrument: 'card' };
  const acct = body.match(
    /(?:a\/c|a\/c\.|acct|account|ac)\b(?:\s*(?:no\.?|number))?(?:\s*(?:ending|ending with|ends with))?\s*[:\-]?\s*[x*#.\s]*([0-9]{3,6})\b/i
  );
  if (acct) return { last4: acct[1].slice(-4), instrument: 'account' };
  if (/\bupi\b|vpa/i.test(body)) return { last4: null, instrument: 'upi' };
  return { last4: null, instrument: 'unknown' };
}

const STOP = String.raw`(?=\s+on\b|\s+via\b|\s+ref|\s+upi|\s+avl|\s+bal|\s+info|\s+using|\s+for\b|\s+dated|\s+txn|\.(?:\s|$)|,|;|\(|-\s|$)`;

function findMerchant(body: string, type: 'expense' | 'income'): string | null {
  const patterns =
    type === 'expense'
      ? [
          new RegExp(String.raw`\bat\s+([A-Za-z0-9&@.'_*/ -]{2,40}?)` + STOP, 'i'),
          new RegExp(String.raw`\bto\s+(?:vpa\s+)?([A-Za-z0-9&@.'_/ -]{2,40}?)` + STOP, 'i'),
          new RegExp(String.raw`\b(?:towards|for)\s+([A-Za-z0-9&@.'_/ -]{2,40}?)` + STOP, 'i'),
          new RegExp(String.raw`;\s*([A-Za-z0-9&@.'_ -]{2,40}?)\s+credited`, 'i'),
        ]
      : [
          new RegExp(String.raw`\b(?:from|by)\s+(?:vpa\s+)?([A-Za-z0-9&@.'_/ -]{2,40}?)` + STOP, 'i'),
          new RegExp(String.raw`\binfo[:\-]?\s*([A-Za-z0-9&@.'_/ -]{2,40}?)` + STOP, 'i'),
        ];
  for (const re of patterns) {
    const m = body.match(re);
    if (!m) continue;
    let name = m[1].trim().replace(/\s{2,}/g, ' ');
    // Drop obvious non-merchants.
    if (/^(?:your|a\/c|ac|acct|account|card|rs|inr|the)\b/i.test(name)) continue;
    if (/^[x*\d\s]+$/i.test(name)) continue;
    name = name.replace(/^(?:neft|imps|rtgs|upi)[-/: ]*/i, '').trim();
    if (name.length >= 2) return name.slice(0, 40);
  }
  return null;
}

/** Has an amount and isn't an OTP / promo / reminder: worth asking the AI about when the rules can't parse it. */
export function looksLikeTxn(body: string): boolean {
  const b = body.replace(/\s+/g, ' ');
  return !SKIP.some((re) => re.test(b)) && amountRe.test(b);
}

const balanceAll = new RegExp(balanceRe.source, 'gi');
const ACCT_DIGITS = /(\b(?:a\/c|acct|account|ac|card|cc|ending(?: with)?|ends with|end)\b[\s:.-]*(?:no\.?|number)?[\s:.-]*)[x*#.]*\s?\d{3,6}\b/gi;

/**
 * Strip what the AI doesn't need before an SMS leaves the phone: account/card digits, balances,
 * the "Dear <name>" greeting, the personal part of UPI IDs, and long reference or phone numbers.
 * Amount, date and merchant stay so the AI can still read the transaction.
 */
export function redactSms(body: string): string {
  return body
    .replace(balanceAll, (m) => m.replace(/\d[\d,]*(?:\.\d+)?/g, '####'))
    .replace(/\b(?:dear|hi|hello)\s+[a-z][a-z .]{0,40}?(?=\s*[,:!-]|\s+(?:your|rs\b|inr|₹))/gi, 'Dear customer')
    .replace(/[\w.-]+@([a-z][a-z0-9]*)\b/gi, '****@$1')
    .replace(ACCT_DIGITS, '$1XX####')
    .replace(/[x*]{2,}\s?\d+/gi, 'XX####')
    .replace(/\d{9,}/g, '#########');
}

export const smsHash = (sms: RawSms) => hashString(`${sms.address}|${sms.date}|${sms.body.replace(/\s+/g, ' ').trim()}`);

export function guessCategory(text: string): { name: string; kind: 'expense' | 'income' } | null {
  for (const [re, name, kind] of CATEGORY_RULES) if (re.test(text)) return { name, kind };
  return null;
}

/** Returns null for non-transaction messages (OTP, promos, reminders, failures). */
export function parseSms(sms: RawSms): ParsedSms | null {
  const body = sms.body.replace(/\s+/g, ' ').trim();
  if (SKIP.some((re) => re.test(body))) return null;

  // Remove the balance clause before finding the transaction amount.
  const balMatch = body.match(balanceRe);
  const balance = balMatch ? toNumber(balMatch[1]) : null;
  const bodyNoBal = balMatch ? body.replace(balMatch[0], ' ') : body;

  const amt = bodyNoBal.match(amountRe);
  if (!amt) return null;
  const amount = toNumber(amt[1]);
  if (!isFinite(amount) || amount <= 0) return null;

  const d = DEBIT_WORDS.exec(bodyNoBal);
  const c = CREDIT_WORDS.exec(bodyNoBal);
  let type: 'expense' | 'income';
  if (d && c) type = d.index <= c.index ? 'expense' : 'income';
  else if (d) type = 'expense';
  else if (c) type = 'income';
  else return null;

  const { last4, instrument } = findLast4(body);
  const atm = type === 'expense' && isAtmWithdrawal(body);
  const cardPayment = type === 'income' && isCardPayment(body);
  const merchant = atm ? 'ATM withdrawal' : cardPayment ? 'Card bill payment' : findMerchant(bodyNoBal, type);
  const guess = atm || cardPayment ? null : guessCategory(`${merchant ?? ''} ${body}`);
  // Don't tag an expense with an income category or vice-versa.
  const categoryHint = guess && guess.kind === type ? guess.name : null;

  return {
    type,
    amount,
    last4,
    instrument,
    merchant,
    balance,
    categoryHint,
    atm,
    cardPayment,
    via: cardPayment ? null : paymentMethod(body, instrument, atm),
    hash: smsHash(sms),
  };
}
