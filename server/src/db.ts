import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/amana.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    income REAL NOT NULL DEFAULT 0,
    unassigned_extra REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_name TEXT NOT NULL,
    name TEXT NOT NULL,
    assigned REAL NOT NULL DEFAULT 0,
    spent REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  -- Learned payee -> category associations, built automatically every time a user
  -- categorizes a transaction (manually or via statement import). This is the memory
  -- behind auto-categorization: the next time a similar payee shows up, we already know
  -- where it belongs, without calling out to any third-party service. One row per
  -- (user, normalized payee); hits lets us prefer well-established patterns if the
  -- user ever re-categorizes the same payee differently.
  CREATE TABLE IF NOT EXISTS payee_category_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payee_key TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    hits INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, payee_key)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    payee TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    cadence TEXT NOT NULL DEFAULT 'Monthly'
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target REAL NOT NULL,
    saved REAL NOT NULL DEFAULT 0
  );

  -- Assets and liabilities, feeding both Net Worth and the Debt Payoff planner.
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'asset' | 'liability'
    category TEXT NOT NULL, -- cash, investment, property, vehicle, credit_card, loan, student_loan, other
    balance REAL NOT NULL DEFAULT 0,
    interest_rate REAL, -- APR %, liabilities only
    min_payment REAL, -- liabilities only
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  -- One row per user per day; upserted whenever accounts change so Net Worth has a real trend line.
  CREATE TABLE IF NOT EXISTS networth_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    total_assets REAL NOT NULL,
    total_liabilities REAL NOT NULL,
    net_worth REAL NOT NULL,
    UNIQUE(user_id, date)
  );

  -- People a user regularly sends money to (a parent back home, a sibling paying school
  -- fees, etc). This is the "Family & Remittances" module — the diaspora/multi-currency
  -- differentiator that generic US-market budgeting apps don't model at all.
  CREATE TABLE IF NOT EXISTS recipients (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT,
    country TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    monthly_target REAL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  -- Each logged transfer. amount_sent/currency_sent is what left the user's account;
  -- amount_received/currency_received is what the recipient actually got, so the app can
  -- surface real total fees and effective FX rate over time — something no mainstream
  -- budgeting app currently tracks.
  CREATE TABLE IF NOT EXISTS remittances (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    amount_sent REAL NOT NULL,
    currency_sent TEXT NOT NULL,
    amount_received REAL,
    currency_received TEXT,
    fee REAL NOT NULL DEFAULT 0,
    method TEXT,
    note TEXT
  );

  -- A household lets a small group of app users (partners, a family) see each other's
  -- high-level money picture — income, spend, savings, net worth — without merging their
  -- actual budgets. Membership is one household per user, joined via a short invite code.
  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A connection is the same lightweight visibility as a household, but one-to-one and
  -- unlimited in number — any two users can pair directly via one user's personal code,
  -- without either of them belonging to (or forming) a named group. user_a_id is always
  -- the lexicographically smaller id, so a pair only ever gets one row regardless of which
  -- side initiated it.
  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    user_a_id TEXT NOT NULL,
    user_b_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_a_id, user_b_id)
  );

  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_networth_user ON networth_snapshots(user_id);
  CREATE INDEX IF NOT EXISTS idx_recipients_user ON recipients(user_id);
  CREATE INDEX IF NOT EXISTS idx_remittances_user ON remittances(user_id);
  CREATE INDEX IF NOT EXISTS idx_remittances_recipient ON remittances(recipient_id);
  CREATE INDEX IF NOT EXISTS idx_connections_a ON connections(user_a_id);
  CREATE INDEX IF NOT EXISTS idx_connections_b ON connections(user_b_id);
  CREATE INDEX IF NOT EXISTS idx_payee_rules_user ON payee_category_rules(user_id);
`);

// --- Lightweight migrations for columns added after initial release ---
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
// Smart subscription alerts: renewal date, and previous amount to detect price hikes.
ensureColumn('subscriptions', 'next_billing_date', 'next_billing_date TEXT');
ensureColumn('subscriptions', 'previous_amount', 'previous_amount REAL');

// Marks whether a user's money figures have gone through the one-time storage-currency
// migration (see migrateStorageCurrency.ts): historically every amount was silently
// converted to USD at entry and back at display time using whatever the live rate was at
// that moment, so the number shown was never exactly the number the person typed and kept
// drifting as rates moved. Amounts are now stored exactly as entered, in the user's own
// chosen currency, with no conversion at all. This flag lets the one-time migration convert
// each non-USD user's *existing* USD-denominated figures into their currency exactly once
// (using the rate at migration time — necessarily an approximation, since the rate at each
// original entry is not recoverable) without ever reapplying on a later restart.
ensureColumn('users', 'storage_migrated_at', 'storage_migrated_at TEXT');

// Personalization: chosen color theme and a lightweight emoji+color avatar (no file
// upload infra needed, but still gives users a real sense of identity in the app).
ensureColumn('users', 'theme', "theme TEXT NOT NULL DEFAULT 'violet'");
ensureColumn('users', 'avatar_emoji', "avatar_emoji TEXT NOT NULL DEFAULT '🙂'");
ensureColumn('users', 'avatar_color', "avatar_color TEXT NOT NULL DEFAULT 'brand'");

// Deeper personalization: an uploaded profile photo (small, resized client-side, stored
// as a data URL — no object storage needed at this scale) and a custom accent color that
// overrides the active theme's brand hue without needing a whole new theme preset.
ensureColumn('users', 'avatar_image', 'avatar_image TEXT');
ensureColumn('users', 'accent_color', 'accent_color TEXT');

// Appearance: light / dark / system (follow the device's own setting). Separate from
// `theme` (the color palette) so any of the 8 palettes can be viewed in either mode.
ensureColumn('users', 'color_mode', "color_mode TEXT NOT NULL DEFAULT 'system'");

// Household membership (see `households` table above) — nullable, one household per user.
ensureColumn('users', 'household_id', 'household_id TEXT');
ensureColumn('users', 'household_role', 'household_role TEXT');

// Refund tracking: mark a transaction as "expecting a refund" so it can be excluded from
// spending totals without deleting the record — mirrors a well-reviewed Simplifi feature.
ensureColumn('transactions', 'refund_expected', 'refund_expected INTEGER NOT NULL DEFAULT 0');

// Every user gets their own shareable pairing code (see `connections` table above),
// independent of household membership — generated lazily on first use rather than at
// signup, so this migration doesn't need to backfill every existing row up front.
ensureColumn('users', 'connect_code', 'connect_code TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_connect_code ON users(connect_code) WHERE connect_code IS NOT NULL');

// Marks categories the app creates and manages itself (currently just the per-user
// "Uncategorized" bucket). System categories can't be deleted or renamed away, so
// deleting a regular category always has somewhere safe to move its transactions to
// instead of destroying transaction history.
ensureColumn('categories', 'is_system', 'is_system INTEGER NOT NULL DEFAULT 0');

// Bumped on every password change (self-service or via a reset link) and stamped into
// each signed JWT. requireAuth compares the token's version against the current column
// value, so changing your password immediately invalidates every *other* signed-in
// session/device — without needing a server-side session table for normal auth.
ensureColumn('users', 'token_version', 'token_version INTEGER NOT NULL DEFAULT 0');

// One-time, short-lived tokens for the "forgot password" flow. Only a SHA-256 hash of the
// token is ever stored — the raw token exists only in the emailed/logged link and briefly
// in the request body. No separate salt is needed here (unlike password hashing) because
// the token itself is 256 bits of server-generated randomness, not a guessable secret. A
// row is consumed (or simply expires) after one use.
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset_tokens(token_hash);
`);
