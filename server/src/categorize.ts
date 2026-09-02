// Auto-categorization engine.
//
// This is intentionally NOT an ML model or a call to a third-party classification API —
// it's a small, transparent, two-layer rule system that runs entirely on our own server
// against our own database:
//
//   1. LEARNED RULES (payee_category_rules): every time a user assigns a category to a
//      transaction — by hand, or by confirming a statement-import suggestion — we
//      remember "this payee → this category" for that user. Next time the same (or a
//      very similar) payee shows up, we already know the answer with high confidence.
//      This is per-user and improves the more the person uses the app.
//
//   2. KEYWORD HEURISTICS: a built-in dictionary of common merchant/description keywords
//      mapped to generic spending groups (Groceries, Dining, Transport, ...). Used only
//      when there's no learned rule yet, to make a best-effort suggestion and to prefill
//      new users' first import with something better than "Uncategorized" for everything.
//
// Anything that doesn't clear a reasonable confidence bar is left for the user to decide
// — we never silently guess on the user's behalf, we just pre-fill a suggestion they can
// accept, change, or clear.

import { randomUUID } from 'crypto';
import { db } from './db';
import type { Category, MatchConfidence } from './types';

// --- Payee normalization -----------------------------------------------------------
// Bank/mobile-money statement descriptions are noisy ("POS 4521 CARREFOUR JUNCTION
// #0221 NAIROBI KE", "MPESA TXN A1B2C3 JOHN K"). We strip the noise so the same
// merchant reliably normalizes to the same key across statements.
const NOISE_TOKENS = [
  'pos', 'purchase', 'payment', 'txn', 'transaction', 'ref', 'pending', 'card',
  'debit', 'credit', 'authorized', 'auth', 'mpesa', 'pos terminal', 'branch',
];

export function normalizePayee(raw: string): string {
  let s = raw.toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, ' '); // strip punctuation
  s = s.replace(/\b\d{3,}\b/g, ' '); // strip long numbers (refs, terminal ids, phone fragments)
  s = s.replace(/\s+/g, ' ').trim();
  const words = s.split(' ').filter((w) => w && !NOISE_TOKENS.includes(w));
  // Keep at most the first 4 meaningful words — merchant names front-load the
  // identifying info; trailing words are usually location/reference noise.
  return words.slice(0, 4).join(' ').trim();
}

// --- Keyword -> generic group heuristics --------------------------------------------
// Deliberately broad and international rather than US-only, since the app targets
// diaspora/multi-currency users. Order matters: first match wins, so more specific
// keywords are listed before generic ones.
const KEYWORD_GROUPS: { group: string; keywords: string[] }[] = [
  {
    group: 'Groceries',
    keywords: ['supermarket', 'supermkt', 'grocer', 'grocery', 'mart', 'naivas', 'carrefour', 'quickmart', 'foodplus', 'greenspoon', 'fresh market'],
  },
  {
    group: 'Dining Out',
    keywords: ['restaurant', 'cafe', 'coffee', 'pizza', 'kfc', 'eatery', 'bar', 'grill', 'diner', 'bistro', 'bakery', 'takeaway', 'java house', 'mcdonald', 'burger'],
  },
  {
    group: 'Transport',
    keywords: ['uber', 'bolt', 'taxi', 'transit', 'fuel', 'petrol', 'shell', 'total energies', 'parking', 'railway', 'metro', 'matatu', 'fare'],
  },
  {
    group: 'Utilities',
    keywords: ['electric', 'power', 'kplc', 'utility', 'water board', 'internet', 'safaricom', 'airtime', 'wifi', 'broadband', 'gas company'],
  },
  {
    group: 'Subscriptions',
    keywords: ['netflix', 'spotify', 'prime video', 'hulu', 'disney', 'subscription', 'gym', 'membership', 'icloud', 'youtube premium', 'showmax'],
  },
  {
    group: 'Rent',
    keywords: ['rent', 'landlord', 'mortgage', 'property mgmt', 'estate management'],
  },
  {
    group: 'Health',
    keywords: ['pharmacy', 'hospital', 'clinic', 'chemist', 'medical', 'dental', 'optical', 'insurance premium'],
  },
  {
    group: 'Shopping',
    keywords: ['amazon', 'jumia', 'mall', 'store', 'shop', 'boutique', 'electronics'],
  },
  {
    group: 'Fees & Transfers',
    keywords: ['fee', 'charge', 'transfer', 'atm', 'withdrawal', 'wire', 'remit'],
  },
  {
    group: 'Income',
    keywords: ['salary', 'payroll', 'deposit', 'refund', 'dividend', 'interest earned'],
  },
];

function keywordGroupFor(normalizedPayee: string): string | null {
  for (const { group, keywords } of KEYWORD_GROUPS) {
    if (keywords.some((kw) => normalizedPayee.includes(kw))) return group;
  }
  return null;
}

// --- The per-user "Uncategorized" bucket --------------------------------------------
// Lazily created the first time it's needed (first low-confidence import, or the first
// time a category with transactions is deleted). Marked is_system so it can't be
// deleted or hijacked by name collisions.
export function getOrCreateUncategorized(userId: string): Category {
  const existing = db
    .prepare('SELECT id, group_name as "group", name, assigned, spent, is_system as isSystem FROM categories WHERE user_id = ? AND is_system = 1 LIMIT 1')
    .get(userId) as any;
  if (existing) return { ...existing, isSystem: !!existing.isSystem };

  const id = 'cat_uncategorized_' + randomUUID().slice(0, 8);
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM categories WHERE user_id = ?').get(userId) as any).m || 0;
  db.prepare(
    'INSERT INTO categories (id, user_id, group_name, name, assigned, spent, sort_order, is_system) VALUES (?,?,?,?,0,0,?,1)'
  ).run(id, userId, 'Uncategorized', 'Uncategorized', maxOrder + 1);
  return { id, group: 'Uncategorized', name: 'Uncategorized', assigned: 0, spent: 0, isSystem: true };
}

// --- Suggestion -----------------------------------------------------------------------
export interface Suggestion {
  categoryId: string | null;
  confidence: MatchConfidence;
  reason: 'learned' | 'keyword' | 'unmatched';
  suggestedGroup?: string;
}

export function suggestCategory(userId: string, payee: string, userCategories: Category[]): Suggestion {
  const key = normalizePayee(payee);
  if (!key) return { categoryId: null, confidence: 'none' as MatchConfidence, reason: 'unmatched' };

  // 1. Exact learned match — the strongest signal we have, built from this user's own
  // past categorization decisions.
  const learned = db
    .prepare('SELECT category_id as categoryId FROM payee_category_rules WHERE user_id = ? AND payee_key = ?')
    .get(userId, key) as { categoryId: string } | undefined;
  if (learned) {
    const stillExists = userCategories.some((c) => c.id === learned.categoryId);
    if (stillExists) return { categoryId: learned.categoryId, confidence: 'high', reason: 'learned' };
  }

  // 2. Fuzzy learned match — the new payee key contains, or is contained by, a
  // previously learned key (handles "carrefour junction" vs "carrefour junction 2").
  const allRules = db
    .prepare('SELECT payee_key as payeeKey, category_id as categoryId FROM payee_category_rules WHERE user_id = ?')
    .all(userId) as { payeeKey: string; categoryId: string }[];
  for (const rule of allRules) {
    if (rule.payeeKey.length >= 4 && (key.includes(rule.payeeKey) || rule.payeeKey.includes(key))) {
      if (userCategories.some((c) => c.id === rule.categoryId)) {
        return { categoryId: rule.categoryId, confidence: 'medium', reason: 'learned' };
      }
    }
  }

  // 3. Keyword heuristic against the user's own categories (match by group or name).
  const group = keywordGroupFor(key);
  if (group) {
    const groupLower = group.toLowerCase();
    const match = userCategories.find(
      (c) => !c.isSystem && (c.group.toLowerCase() === groupLower || c.name.toLowerCase() === groupLower)
    );
    if (match) return { categoryId: match.id, confidence: 'medium', reason: 'keyword' };
    // No matching category exists yet — still useful: tell the caller what group we'd
    // suggest, so the UI can offer "create '<group>' category" instead of a blind guess.
    return { categoryId: null, confidence: 'low', reason: 'keyword', suggestedGroup: group };
  }

  return { categoryId: null, confidence: 'none', reason: 'unmatched' };
}

// Called whenever a user (explicitly or via a confirmed import row) assigns a category
// to a payee — this is how the engine gets smarter over time, per user.
export function learnFromCategorization(userId: string, payee: string, categoryId: string) {
  const key = normalizePayee(payee);
  if (!key) return;
  db.prepare(
    `INSERT INTO payee_category_rules (id, user_id, payee_key, category_id, hits, updated_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(user_id, payee_key) DO UPDATE SET
       category_id = excluded.category_id,
       hits = payee_category_rules.hits + 1,
       updated_at = datetime('now')`
  ).run('rule_' + randomUUID().slice(0, 8), userId, key, categoryId);
}

// --- Duplicate detection ---------------------------------------------------------------
// A statement re-uploaded (or overlapping a prior upload) shouldn't double-count spend.
// We flag same-user transactions within 1 day of the statement row's date, with the same
// amount (to the cent) and a closely matching payee, as likely duplicates. This is a
// warning, not a hard block — the user makes the final call in the review step.
export function findDuplicate(userId: string, date: string, payee: string, amount: number): string | undefined {
  const key = normalizePayee(payee);
  const candidates = db
    .prepare(
      `SELECT id, date, payee, amount FROM transactions
       WHERE user_id = ? AND ABS(amount - ?) < 0.005
       AND date(date) BETWEEN date(?, '-1 day') AND date(?, '+1 day')`
    )
    .all(userId, amount, date, date) as { id: string; date: string; payee: string; amount: number }[];
  const match = candidates.find((c) => {
    const ckey = normalizePayee(c.payee);
    return ckey === key || (ckey.length >= 4 && (ckey.includes(key) || key.includes(ckey)));
  });
  return match?.id;
}
