import type { SQLiteDatabase } from 'expo-sqlite';

import { CATEGORY_CATALOG } from '@/catalog/categories';

const SYNC_COLS = `
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0`;

/**
 * Ordered migrations; index + 1 = schema version stored in PRAGMA user_version. v1 is the whole
 * schema. To change it in a later build, APPEND a step (never edit or reorder a shipped one), e.g.
 * `ALTER TABLE accounts ADD COLUMN remind_days INTEGER;`. New columns must allow NULL (or have a
 * DEFAULT); synced columns are never renamed or dropped (older phones still send them).
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (${SYNC_COLS},
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    institution TEXT,
    last4 TEXT,
    card_last4 TEXT,
    network TEXT,
    opening_balance REAL NOT NULL DEFAULT 0,
    credit_limit REAL,
    billing_day INTEGER,
    notes TEXT
  );
  CREATE TABLE categories (${SYNC_COLS},
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT
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
    sms_hash TEXT,
    tags TEXT,
    via TEXT
  );
  CREATE INDEX idx_txn_date ON transactions(date);
  CREATE INDEX idx_txn_account ON transactions(account_id);
  CREATE INDEX idx_txn_to_account ON transactions(to_account_id);
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
  -- Monthly budgets: category_id null = the overall budget.
  CREATE TABLE budgets (${SYNC_COLS},
    category_id TEXT,
    amount REAL NOT NULL
  );
  -- Multi-device sync: the clock of each column's last write (src/sync/crdt.ts).
  CREATE TABLE field_clock (
    tbl TEXT NOT NULL,
    row_id TEXT NOT NULL,
    col TEXT NOT NULL,
    hlc TEXT NOT NULL,
    PRIMARY KEY (tbl, row_id, col)
  ) WITHOUT ROWID;
  CREATE INDEX idx_field_clock_hlc ON field_clock(hlc);
  -- Local-only key/value settings (not synced): sync state, SMS scan cursor, etc.
  CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  `,
  // v2: payment due day (cards) / EMI day (loans), loan terms, and savings goals.
  `
  ALTER TABLE accounts ADD COLUMN due_day INTEGER;
  ALTER TABLE accounts ADD COLUMN interest_rate REAL;
  ALTER TABLE accounts ADD COLUMN emi REAL;
  CREATE TABLE goals (${SYNC_COLS},
    name TEXT NOT NULL,
    target REAL NOT NULL,
    target_date INTEGER,
    account_id TEXT,
    saved REAL NOT NULL DEFAULT 0,
    notes TEXT
  );
  `,
  // v3: an investment entry paid from / into one of your accounts, and the transaction that records it there.
  `
  ALTER TABLE investment_entries ADD COLUMN account_id TEXT;
  ALTER TABLE investment_entries ADD COLUMN txn_id TEXT;
  `,
];

// Fixed ids so seeded categories are identical on every device and merge cleanly on sync.
export const seedCategoryId = (name: string) =>
  'cat-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Default categories, with fixed ids and no field clocks, so they're identical on every phone and any
 * real edit wins over them. Runs on every start: OR IGNORE keeps existing rows (even deleted ones),
 * so it only adds defaults that are new in this app version.
 */
export async function seedCategories(db: SQLiteDatabase) {
  const now = Date.now();
  for (const c of CATEGORY_CATALOG) {
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, created_at, updated_at, deleted, name, kind, color, icon) VALUES (?, ?, 0, 0, ?, ?, ?, ?)',
      [seedCategoryId(c.name), now, c.name, c.kind, c.color, c.icon]
    );
  }
}

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version > MIGRATIONS.length) throw new Error(`Database version ${version} is newer than this app (${MIGRATIONS.length})`);

  const before = version;
  while (version < MIGRATIONS.length) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[version]);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
  // Updated to a version with new columns: read the other phones' snapshots again, once. While on the
  // older version, this phone skipped columns it didn't have yet (src/sync/crdt.ts knownColumns).
  if (before > 0 && version > before) await db.runAsync("DELETE FROM settings WHERE key IN ('drive_applied', 'drive_listed_until')");
  await db.withExclusiveTransactionAsync((txn) => seedCategories(txn));
}
