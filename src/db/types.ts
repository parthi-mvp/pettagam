// Every synced row carries: id (uuid), updated_at (epoch ms), deleted (0/1 soft-delete).
// Sync merges rows by id using last-write-wins on updated_at.

export type SyncedRow = {
  id: string;
  created_at: number;
  updated_at: number;
  deleted: 0 | 1;
};

export type AccountType =
  | 'bank'
  | 'overdraft'
  | 'credit_card'
  | 'pay_later'
  | 'wallet'
  | 'meal_card'
  | 'fastag'
  | 'cash'
  | 'loan'
  | 'lent'
  | 'borrowed';

export type Account = SyncedRow & {
  name: string;
  type: AccountType;
  institution: string | null;
  last4: string | null; // used to match SMS ("A/c XX1234", "card ending 1234")
  /** Bank accounts: the debit card's last 4, which ATM and card-spend alerts quote instead. */
  card_last4: string | null;
  opening_balance: number; // for credit cards / loans: opening outstanding
  credit_limit: number | null;
  billing_day: number | null; // credit card statement day (1-31)
  notes: string | null;
};

export type CategoryKind = 'expense' | 'income';

export type Category = SyncedRow & {
  name: string;
  kind: CategoryKind;
  color: string;
  /** An IconName picked by the user; null for seeded categories (icon guessed from the name). */
  icon: string | null;
};

export type TxnType = 'expense' | 'income' | 'transfer';

export type Transaction = SyncedRow & {
  account_id: string;
  to_account_id: string | null; // transfer target (e.g. paying a credit card bill)
  type: TxnType;
  amount: number;
  category_id: string | null;
  date: number; // epoch ms
  merchant: string | null;
  note: string | null;
  source: 'manual' | 'sms' | 'investment';
  sms_hash: string | null; // dedupe key for SMS imports
};

export type InvestmentType =
  | 'fd'
  | 'rd'
  | 'chit'
  | 'stock'
  | 'mutual_fund'
  | 'gold'
  | 'ppf'
  | 'epf'
  | 'nps'
  | 'bond'
  | 'real_estate'
  | 'crypto'
  | 'other'
  // Added from docs/money-catalog.md §2
  | 'corporate_fd'
  | 'po_td'
  | 'po_mis'
  | 'nsc'
  | 'kvp'
  | 'scss'
  | 'ssy'
  | 'apy'
  | 'etf'
  | 'reit'
  | 'invit'
  | 'us_stock'
  | 'esop'
  | 'digital_gold'
  | 'sgb'
  | 'silver'
  | 'lic'
  | 'ulip';

export type Investment = SyncedRow & {
  type: InvestmentType;
  name: string;
  institution: string | null; // bank / broker / AMC / chit company
  invested_amount: number; // total principal put in (kept in sync with entries)
  current_value: number; // latest valuation (manual update or computed)
  quantity: number | null; // shares, units, grams of gold
  interest_rate: number | null; // % p.a. for FD/RD/PPF/bonds
  start_date: number | null;
  maturity_date: number | null;
  // Type-specific extras as JSON, e.g. chit: { chitValue, months, installment, prizeMonth, prizeAmount }
  details: string | null;
  notes: string | null;
};

export type InvestmentEntryKind =
  | 'buy'
  | 'sell'
  | 'contribution' // SIP, RD, chit installment
  | 'dividend'
  | 'interest'
  | 'payout' // chit prize / maturity proceeds
  | 'valuation'; // snapshot of current value

export type InvestmentEntry = SyncedRow & {
  investment_id: string;
  kind: InvestmentEntryKind;
  date: number;
  amount: number;
  units: number | null;
  note: string | null;
};

/** A monthly spending limit. category_id null = the overall budget for all spending. */
export type Budget = SyncedRow & {
  category_id: string | null;
  amount: number;
};

export type TableName = 'accounts' | 'categories' | 'transactions' | 'investments' | 'investment_entries' | 'budgets';

export const SYNCED_TABLES: TableName[] = [
  'accounts',
  'categories',
  'transactions',
  'investments',
  'investment_entries',
  'budgets',
];

// Order = order in the type sheet: deposits, small savings, retirement, market, gold, insurance, other.
export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  fd: 'Fixed Deposit',
  rd: 'Recurring Deposit',
  corporate_fd: 'Corporate FD',
  po_td: 'Post Office Time Deposit',
  po_mis: 'Post Office Monthly Income',
  nsc: 'NSC',
  kvp: 'Kisan Vikas Patra',
  scss: 'Senior Citizens Savings',
  ssy: 'Sukanya Samriddhi',
  ppf: 'PPF',
  epf: 'EPF / VPF',
  nps: 'NPS',
  apy: 'Atal Pension Yojana',
  stock: 'Stocks',
  mutual_fund: 'Mutual Fund',
  etf: 'ETF',
  reit: 'REIT',
  invit: 'InvIT',
  bond: 'Bonds',
  us_stock: 'US Stocks',
  esop: 'ESOP / RSU',
  gold: 'Gold',
  digital_gold: 'Digital Gold',
  sgb: 'Sovereign Gold Bond',
  silver: 'Silver',
  lic: 'LIC / Endowment',
  ulip: 'ULIP',
  chit: 'Chit Fund',
  real_estate: 'Real Estate',
  crypto: 'Crypto',
  other: 'Other',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank Account',
  overdraft: 'Overdraft',
  credit_card: 'Credit Card',
  pay_later: 'Pay Later',
  wallet: 'Wallet / UPI',
  meal_card: 'Meal Card',
  fastag: 'FASTag',
  cash: 'Cash',
  loan: 'Loan',
  lent: 'Money Lent',
  borrowed: 'Money Borrowed',
};

/** Display order everywhere (Accounts screen, pickers). */
export const ACCOUNT_TYPE_ORDER = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

/** Liability accounts: balance = amount owed. */
export const isLiability = (t: AccountType) => t === 'credit_card' || t === 'pay_later' || t === 'loan' || t === 'borrowed';
/**
 * Balance from the opening amount and the net flow (money in − money out). Liabilities show what
 * is owed, so spending on them raises the balance. Same rule as the server's account_balances view.
 */
export const balanceOf = (t: AccountType, opening: number, flow: number) => (isLiability(t) ? opening - flow : opening + flow);
/** Owed on a statement cycle: limit, statement day, counted as card dues. */
export const isCardLike = (t: AccountType) => t === 'credit_card' || t === 'pay_later';
/** A person, not an institution: no bank, no SMS matching. */
export const isPersonal = (t: AccountType) => t === 'lent' || t === 'borrowed';
