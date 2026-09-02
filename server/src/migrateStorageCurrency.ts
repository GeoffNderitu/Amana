import { db } from './db';
import { getRatesCached } from './routes/rates';

/**
 * One-time fix for the "figures kept drifting" bug: every money amount used to be stored
 * in USD and converted to the user's chosen currency (and back) using whatever the live
 * exchange rate was *at that moment* — so a number typed today could display differently
 * tomorrow purely because the rate moved, even though nothing about the transaction changed.
 *
 * Going forward, amounts are stored exactly as entered, in the user's own currency, with no
 * conversion at all. This migration runs once per user to bring *existing* data in line with
 * that: for anyone whose account currency isn't USD, it converts their historical
 * USD-denominated figures into their currency using today's rate. This is necessarily an
 * approximation — the exact rate in effect on the day each figure was originally entered
 * isn't recoverable — but leaving old figures as raw USD numbers mislabeled as the user's
 * currency would be far more wrong (off by the full exchange-rate factor, e.g. ~130x for
 * KES), so a one-time approximate conversion is the better of the two options.
 *
 * Guarded by users.storage_migrated_at so it only ever runs once per user, even across
 * repeated server restarts.
 */
/** Multiplies every stored money figure for one user by `factor`, in a single transaction. */
function applyConversionFactor(userId: string, factor: number) {
  const run = db.transaction(() => {
    db.prepare(`UPDATE users SET income = income * ?, unassigned_extra = unassigned_extra * ? WHERE id = ?`).run(factor, factor, userId);
    db.prepare(`UPDATE categories SET assigned = assigned * ?, spent = spent * ? WHERE user_id = ?`).run(factor, factor, userId);
    db.prepare(`UPDATE transactions SET amount = amount * ? WHERE user_id = ?`).run(factor, userId);
    db.prepare(`UPDATE subscriptions SET amount = amount * ?, previous_amount = CASE WHEN previous_amount IS NULL THEN NULL ELSE previous_amount * ? END WHERE user_id = ?`).run(factor, factor, userId);
    db.prepare(`UPDATE goals SET target = target * ?, saved = saved * ? WHERE user_id = ?`).run(factor, factor, userId);
    db.prepare(`UPDATE accounts SET balance = balance * ?, min_payment = CASE WHEN min_payment IS NULL THEN NULL ELSE min_payment * ? END WHERE user_id = ?`).run(factor, factor, userId);
    db.prepare(
      `UPDATE networth_snapshots SET total_assets = total_assets * ?, total_liabilities = total_liabilities * ?, net_worth = net_worth * ? WHERE user_id = ?`
    ).run(factor, factor, factor, userId);
  });
  run();
}

/**
 * Converts one user's existing money figures from one currency to another using today's
 * live rate, pivoting through USD (the rates endpoint's base). Used whenever someone changes
 * their account currency in Settings — without this, switching the currency label would
 * leave every existing number's face value unchanged while silently reinterpreting it as a
 * different currency (e.g. a KES 6,500 grocery transaction would suddenly read as $6,500).
 * Returns the factor applied, or null if a live rate wasn't available (caller should then
 * leave the figures untouched rather than guess).
 */
export async function convertUserMoneyFigures(userId: string, fromCurrency: string, toCurrency: string): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1;
  try {
    const { rates } = await getRatesCached('USD');
    const fromRate = fromCurrency === 'USD' ? 1 : rates[fromCurrency]; // 1 USD = fromRate fromCurrency
    const toRate = toCurrency === 'USD' ? 1 : rates[toCurrency]; // 1 USD = toRate toCurrency
    if (!fromRate || !toRate) return null;
    const factor = toRate / fromRate; // 1 fromCurrency = factor toCurrency
    applyConversionFactor(userId, factor);
    return factor;
  } catch {
    return null;
  }
}

export async function migrateStorageCurrency() {
  const users = db
    .prepare(`SELECT id, currency FROM users WHERE storage_migrated_at IS NULL`)
    .all() as { id: string; currency: string }[];

  if (users.length === 0) return;

  const markDone = db.prepare(`UPDATE users SET storage_migrated_at = datetime('now') WHERE id = ?`);

  for (const user of users) {
    if (user.currency === 'USD') {
      // Nothing to convert — USD-denominated figures already match a USD account.
      markDone.run(user.id);
      continue;
    }

    let rate: number | null = null;
    try {
      const { rates } = await getRatesCached('USD');
      const r = rates[user.currency];
      if (typeof r === 'number') rate = r;
    } catch {
      // Live rates unavailable right now — leave this user unmigrated and retry on the
      // next server start rather than guessing or silently skipping them permanently.
    }
    if (rate === null) continue;

    applyConversionFactor(user.id, rate);
    markDone.run(user.id);
    console.log(`[migrateStorageCurrency] Converted existing figures for user ${user.id} to ${user.currency} at rate ${rate}`);
  }
}
