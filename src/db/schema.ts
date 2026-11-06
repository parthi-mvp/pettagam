import type { SQLiteDatabase } from 'expo-sqlite';

import { CATEGORY_CATALOG } from '@/catalog/categories';

const SYNC_COLS = `
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0`;

/** Ordered migrations; index + 1 = schema version stored in PRAGMA user_version. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (${SYNC_COLS},
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    institution TEXT,
    last4 TEXT,
    opening_balance REAL NOT NULL DEFAULT 0,
    credit_limit REAL,
    billing_day INTEGER,
    notes TEXT
  );
  CREATE TABLE categories (${SYNC_COLS},
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    color TEXT NOT NULL
  );
  CREATE TABLE transactions (${SYNC_COLS},
    account_id TEXT NOT NULL,
    to_account_id TEXT,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id TEXT,
    date INTEGER NOT NULL,
    merchant TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    sms_hash TEXT
  );
  CREATE INDEX idx_txn_date ON transactions(date);
  CREATE INDEX idx_txn_account ON transactions(account_id);
  CREATE INDEX idx_txn_sms ON transactions(sms_hash);
  CREATE TABLE investments (${SYNC_COLS},
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    institution TEXT,
    invested_amount REAL NOT NULL DEFAULT 0,
    current_value REAL NOT NULL DEFAULT 0,
    quantity REAL,
    interest_rate REAL,
    start_date INTEGER,
    maturity_date INTEGER,
    details TEXT,
    notes TEXT
  );
  CREATE TABLE investment_entries (${SYNC_COLS},
    investment_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    date INTEGER NOT NULL,
    amount REAL NOT NULL,
    units REAL,
    note TEXT
  );
  CREATE INDEX idx_inv_entry ON investment_entries(investment_id);
  -- Local-only key/value settings (not synced): last sync time, SMS scan cursor, etc.
  CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  `,
  // v2 — rows edited on this phone since the last backup (the "outbox"; src/sync/drive-sync.ts).
  // One entry per row; re-editing a queued row just bumps its seq.
  `
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    UNIQUE (table_name, row_id)
  );
  `,
  // v3 — categories can carry a chosen icon (null = guess from the name).
  `ALTER TABLE categories ADD COLUMN icon TEXT;`,
  // v4 — a bank account's debit card digits: ATM and card alerts quote the card, not the account.
  `ALTER TABLE accounts ADD COLUMN card_last4 TEXT;`,
  // v5 — monthly budgets: category_id null = the overall budget.
  `CREATE TABLE budgets (${SYNC_COLS},
    category_id TEXT,
    amount REAL NOT NULL
  );`,
  // v6 — account balances match transfers by to_account_id too; without this they scan every transaction.
  `CREATE INDEX idx_txn_to_account ON transactions(to_account_id);`,
  // v7 — tags: a JSON array of labels that cut across categories (src/lib/tags.ts).
  `ALTER TABLE transactions ADD COLUMN tags TEXT;`,
  // v8 — how the money moved, read from the SMS (upi, card, neft…; src/sms/parser.ts).
  `ALTER TABLE transactions ADD COLUMN via TEXT;`,
  // v9 — a card's network (visa, mastercard, rupay…; src/catalog/networks.ts).
  `ALTER TABLE accounts ADD COLUMN network TEXT;`,
  // v10 — multi-device sync: the clock of each column's last write (src/sync/crdt.ts). Rows with no
  // entry here count as written at their updated_at, so existing data needs no conversion.
  `
  CREATE TABLE field_clock (
    tbl TEXT NOT NULL,
    row_id TEXT NOT NULL,
    col TEXT NOT NULL,
    hlc TEXT NOT NULL,
    PRIMARY KEY (tbl, row_id, col)
  ) WITHOUT ROWID;
  `,
];

// Fixed ids so seeded categories are identical on every device and merge cleanly on sync.
export const seedCategoryId = (name: string) =>
  'cat-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Default categories. updated_at = 0 so any real edit, on any device, wins over the seed.
 * Runs on every start: OR IGNORE keeps existing rows (even deleted ones), so it only adds defaults
 * that are new in this app version.
 */
export async function seedCategories(db: SQLiteDatabase) {
  const now = Date.now();
  for (const c of CATEGORY_CATALOG) {
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, created_at, updated_at, deleted, name, kind, color, icon) VALUES (?, ?, 0, 0, ?, ?, ?, ?)',
      [seedCategoryId(c.name), now, c.name, c.kind, c.color, c.icon]
    );
    // Seeds from before icons existed: give untouched ones (updated_at still 0) their catalogue icon.
    await db.runAsync('UPDATE categories SET icon = ? WHERE id = ? AND icon IS NULL AND updated_at = 0', [c.icon, seedCategoryId(c.name)]);
  }
}

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[version]);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
  // After migrations, so the icon column (v3) exists.
  await db.withExclusiveTransactionAsync((txn) => seedCategories(txn));
}
