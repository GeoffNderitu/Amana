import { randomBytes } from 'crypto';
import { db } from './db';

/**
 * A shared-visibility snapshot is deliberately high-level — income, spend, an actual savings
 * figure, net worth, goal progress, and an aggregate overspend signal — never the underlying
 * categories or transactions. Used both for household members and for one-to-one
 * connections, since the privacy boundary is identical either way: visibility without
 * merging or exposing a single line item.
 */
export function memberSnapshot(userId: string) {
  const user = db.prepare('SELECT id, name, currency, income, avatar_emoji, avatar_color, avatar_image FROM users WHERE id = ?').get(userId) as any;
  if (!user) return null;

  // Deliberately NOT filtered to the current calendar month: the client's own Dashboard
  // ("Spent this month" / lib/savings.ts computeSavings) defines "spent" as the sum of every
  // transaction on the account, full stop, with no date filter. This has to use the exact
  // same definition — a household/connection view that used a different formula (e.g.
  // date-scoped to the current month) would silently disagree with what the person sees on
  // their own Dashboard, showing near-zero spend and near-100% "saved" the moment any
  // transaction happens to be dated outside the current month.
  const spentRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ?`).get(userId) as any;
  const spent = spentRow?.total || 0;

  const assets = (db.prepare(`SELECT COALESCE(SUM(balance), 0) as t FROM accounts WHERE user_id = ? AND type = 'asset'`).get(userId) as any)?.t || 0;
  const liabilities = (db.prepare(`SELECT COALESCE(SUM(balance), 0) as t FROM accounts WHERE user_id = ? AND type = 'liability'`).get(userId) as any)?.t || 0;

  const goalsRow = db
    .prepare(`SELECT COALESCE(SUM(saved), 0) as saved, COALESCE(SUM(target), 0) as target, COUNT(*) as count FROM goals WHERE user_id = ?`)
    .get(userId) as any;

  // Aggregate-only overspend signal — a count and a total, never which categories, so a
  // connection can see "Alex is over budget somewhere" without it becoming a window into
  // their actual spending categories.
  const overspendRow = db
    .prepare(`SELECT COUNT(*) as c, COALESCE(SUM(spent - assigned), 0) as total FROM categories WHERE user_id = ? AND assigned > 0 AND spent > assigned`)
    .get(userId) as any;

  const actualSaved = Math.max(0, user.income - spent);
  const savingsRate = user.income > 0 ? actualSaved / user.income : 0;

  return {
    id: user.id,
    name: user.name,
    currency: user.currency,
    avatarEmoji: user.avatar_emoji,
    avatarColor: user.avatar_color,
    avatarImage: user.avatar_image,
    income: user.income,
    spentThisMonth: spent,
    actualSavedThisMonth: actualSaved,
    savingsRate,
    netWorth: assets - liabilities,
    goalsSaved: goalsRow?.saved || 0,
    goalsTarget: goalsRow?.target || 0,
    goalsCount: goalsRow?.count || 0,
    overspentCategoryCount: overspendRow?.c || 0,
    overspentTotal: overspendRow?.total || 0,
  };
}

// Short, uppercase, and avoids ambiguous characters (0/O, 1/I/L) so a code is easy to read
// aloud or type from a phone screen. Shared by household invite codes and personal connect
// codes so they look and behave the same way to the user.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateShortCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
