import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../auth';
import { getOrCreateUncategorized, suggestCategory, learnFromCategorization, findDuplicate } from '../categorize';
import type {
  Category,
  Transaction,
  Subscription,
  Goal,
  Account,
  NetWorthSnapshot,
  FullState,
  Recipient,
  Remittance,
  StatementRow,
  CategorySuggestion,
} from '../types';

export const api = Router();
api.use(requireAuth);

function getUser(userId: string) {
  return db.prepare('SELECT income, unassigned_extra as unassignedExtra, currency FROM users WHERE id = ?').get(userId) as any;
}
function getCategories(userId: string): Category[] {
  const rows = db
    .prepare('SELECT id, group_name as "group", name, assigned, spent, is_system as isSystem FROM categories WHERE user_id = ? ORDER BY sort_order ASC')
    .all(userId) as (Omit<Category, 'isSystem'> & { isSystem: number })[];
  return rows.map((r) => ({ ...r, isSystem: !!r.isSystem }));
}
function getTransactions(userId: string): Transaction[] {
  const rows = db
    .prepare('SELECT id, date, payee, amount, category_id as categoryId, refund_expected as refundExpected FROM transactions WHERE user_id = ? ORDER BY date DESC')
    .all(userId) as (Omit<Transaction, 'refundExpected'> & { refundExpected: number })[];
  return rows.map((r) => ({ ...r, refundExpected: !!r.refundExpected }));
}
function getSubscriptions(userId: string): Subscription[] {
  return db
    .prepare(
      'SELECT id, name, amount, cadence, next_billing_date as nextBillingDate, previous_amount as previousAmount FROM subscriptions WHERE user_id = ?'
    )
    .all(userId) as Subscription[];
}
function getGoals(userId: string): Goal[] {
  return db.prepare('SELECT id, name, target, saved FROM goals WHERE user_id = ?').all(userId) as Goal[];
}
function getAccounts(userId: string): Account[] {
  return db
    .prepare(
      'SELECT id, name, type, category, balance, interest_rate as interestRate, min_payment as minPayment FROM accounts WHERE user_id = ? ORDER BY sort_order ASC'
    )
    .all(userId) as Account[];
}
function getSnapshots(userId: string): NetWorthSnapshot[] {
  return db
    .prepare(
      'SELECT date, total_assets as totalAssets, total_liabilities as totalLiabilities, net_worth as netWorth FROM networth_snapshots WHERE user_id = ? ORDER BY date ASC'
    )
    .all(userId) as NetWorthSnapshot[];
}
// Recompute today's net worth from current account balances and upsert the snapshot,
// so Net Worth always has a real trend line without the user doing anything extra.
function recordSnapshot(userId: string) {
  const accounts = getAccounts(userId);
  const totalAssets = accounts.filter((a) => a.type === 'asset').reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = accounts.filter((a) => a.type === 'liability').reduce((s, a) => s + a.balance, 0);
  const netWorth = totalAssets - totalLiabilities;
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO networth_snapshots (id, user_id, date, total_assets, total_liabilities, net_worth)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id, date) DO UPDATE SET total_assets = excluded.total_assets, total_liabilities = excluded.total_liabilities, net_worth = excluded.net_worth`
  ).run('nw_' + randomUUID().slice(0, 8), userId, today, totalAssets, totalLiabilities, netWorth);
}
function getRecipients(userId: string): Recipient[] {
  return db
    .prepare(
      'SELECT id, name, relationship, country, currency, monthly_target as monthlyTarget FROM recipients WHERE user_id = ? ORDER BY sort_order ASC'
    )
    .all(userId) as Recipient[];
}
function getRemittances(userId: string): Remittance[] {
  return db
    .prepare(
      `SELECT id, recipient_id as recipientId, date, amount_sent as amountSent, currency_sent as currencySent,
              amount_received as amountReceived, currency_received as currencyReceived, fee, method, note
       FROM remittances WHERE user_id = ? ORDER BY date DESC`
    )
    .all(userId) as Remittance[];
}

function getFullState(userId: string): FullState {
  return {
    settings: getUser(userId),
    categories: getCategories(userId),
    transactions: getTransactions(userId),
    subscriptions: getSubscriptions(userId),
    goals: getGoals(userId),
    accounts: getAccounts(userId),
    netWorthSnapshots: getSnapshots(userId),
    recipients: getRecipients(userId),
    remittances: getRemittances(userId),
  };
}

api.get('/state', (req: AuthedRequest, res) => {
  res.json(getFullState(req.userId!));
});

api.put('/settings', (req: AuthedRequest, res) => {
  const { income } = req.body as { income: number };
  if (typeof income !== 'number' || !Number.isFinite(income) || income < 0 || income > 100_000_000) return res.status(400).json({ error: 'Invalid income' });
  db.prepare('UPDATE users SET income = ? WHERE id = ?').run(income, req.userId);
  res.json(getUser(req.userId!));
});

api.post('/categories', (req: AuthedRequest, res) => {
  const { name, group } = req.body as { name: string; group?: string };
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 80) return res.status(400).json({ error: 'Name required' });
  const id = 'cat_' + randomUUID().slice(0, 8);
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM categories WHERE user_id = ?').get(req.userId) as any).m || 0;
  db.prepare('INSERT INTO categories (id, user_id, group_name, name, assigned, spent, sort_order) VALUES (?,?,?,?,0,0,?)').run(
    id,
    req.userId,
    group || 'Custom',
    name.trim(),
    maxOrder + 1
  );
  res.status(201).json(getCategories(req.userId!));
});

api.put('/categories/:id/assign', (req: AuthedRequest, res) => {
  const { assigned } = req.body as { assigned: number };
  if (typeof assigned !== 'number' || !Number.isFinite(assigned) || assigned < 0 || assigned > 100_000_000) return res.status(400).json({ error: 'Invalid amount' });
  const result = db
    .prepare('UPDATE categories SET assigned = ? WHERE id = ? AND user_id = ?')
    .run(assigned, req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json(getCategories(req.userId!));
});

api.delete('/categories/:id', (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const target = db
    .prepare('SELECT id, group_name as "group", name, assigned, spent, is_system as isSystem FROM categories WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as (Omit<Category, 'isSystem'> & { isSystem: number }) | undefined;
  if (!target) return res.status(404).json({ error: 'Category not found' });
  if (target.isSystem) return res.status(400).json({ error: '"Uncategorized" is a built-in category and can\'t be deleted.' });

  const txCount = (db.prepare('SELECT COUNT(*) as n FROM transactions WHERE category_id = ? AND user_id = ?').get(req.params.id, userId) as any).n;

  let reassigned = 0;
  const run = db.transaction(() => {
    if (txCount > 0) {
      // Categories can have real transaction history attached. Deleting the category
      // must never silently delete that history — instead, move its transactions to the
      // user's "Uncategorized" bucket (created on first use) so nothing is lost, then
      // remove the now-empty category.
      const bucket = getOrCreateUncategorized(userId);
      db.prepare('UPDATE transactions SET category_id = ? WHERE category_id = ? AND user_id = ?').run(bucket.id, req.params.id, userId);
      db.prepare('UPDATE categories SET spent = spent + ? WHERE id = ? AND user_id = ?').run(target.spent, bucket.id, userId);
      reassigned = txCount;
    }
    db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  });
  run();

  res.json({ categories: getCategories(userId), reassignedTransactions: reassigned });
});

api.post('/transactions', (req: AuthedRequest, res) => {
  const { date, payee, amount, categoryId, refundExpected } = req.body as Transaction;
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'A valid date is required' });
  }
  if (!payee || typeof payee !== 'string' || !payee.trim() || payee.length > 160) {
    return res.status(400).json({ error: 'Payee is required' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) > 100_000_000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (!categoryId || typeof categoryId !== 'string') {
    return res.status(400).json({ error: 'Category is required' });
  }
  const cat = db.prepare('SELECT id, is_system as isSystem FROM categories WHERE id = ? AND user_id = ?').get(categoryId, req.userId) as
    | { id: string; isSystem: number }
    | undefined;
  if (!cat) return res.status(400).json({ error: 'Unknown category' });

  const id = 't_' + randomUUID().slice(0, 8);
  const insertTx = db.transaction(() => {
    db.prepare('INSERT INTO transactions (id, user_id, date, payee, amount, category_id, refund_expected) VALUES (?,?,?,?,?,?,?)').run(
      id,
      req.userId,
      date,
      payee.trim(),
      amount,
      categoryId,
      refundExpected ? 1 : 0
    );
    db.prepare('UPDATE categories SET spent = spent + ? WHERE id = ? AND user_id = ?').run(amount, categoryId, req.userId);
  });
  insertTx();
  // Every manually-categorized transaction teaches the auto-categorizer for next time —
  // this is how future statement imports get better without any external service. We
  // deliberately skip this when the chosen category is the system "Uncategorized" bucket:
  // filing something there is a non-decision, not a categorization, and learning from it
  // would actively unlearn a good rule the next time this payee shows up.
  if (!cat.isSystem) learnFromCategorization(req.userId!, payee.trim(), categoryId);
  res.status(201).json({ transactions: getTransactions(req.userId!), categories: getCategories(req.userId!) });
});

// Full edit of an existing transaction — date, payee, amount, and/or category. Previously
// the only way to fix a typo'd payee or a wrong category was delete-and-re-add, which lost
// the row's identity and silently detached it from refund-tracking history. Category spend
// totals are kept correct by first reversing the old amount out of the old category, then
// applying the new amount to the (possibly different) new category — done inside a single
// transaction so a partial failure can't leave spend totals out of sync.
api.put('/transactions/:id', (req: AuthedRequest, res) => {
  const { date, payee, amount, categoryId, refundExpected } = req.body as Partial<Transaction>;
  const current = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!current) return res.status(404).json({ error: 'Transaction not found' });

  const nextDate = date !== undefined ? date : current.date;
  if (!nextDate || typeof nextDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
    return res.status(400).json({ error: 'A valid date is required' });
  }
  const nextPayee = payee !== undefined ? payee : current.payee;
  if (!nextPayee || typeof nextPayee !== 'string' || !nextPayee.trim() || nextPayee.length > 160) {
    return res.status(400).json({ error: 'Payee is required' });
  }
  const nextAmount = amount !== undefined ? amount : current.amount;
  if (typeof nextAmount !== 'number' || !Number.isFinite(nextAmount) || Math.abs(nextAmount) > 100_000_000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  const nextCategoryId = categoryId !== undefined ? categoryId : current.category_id;
  const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(nextCategoryId, req.userId);
  if (!cat) return res.status(400).json({ error: 'Unknown category' });
  const nextRefundExpected = refundExpected !== undefined ? !!refundExpected : !!current.refund_expected;

  const applyEdit = db.transaction(() => {
    // Reverse the old amount out of the category it used to belong to...
    db.prepare('UPDATE categories SET spent = MAX(0, spent - ?) WHERE id = ? AND user_id = ?').run(
      current.amount,
      current.category_id,
      req.userId
    );
    // ...then apply the new amount to whichever category it belongs to now (same category
    // if it wasn't changed, so this still nets out correctly either way).
    db.prepare('UPDATE categories SET spent = spent + ? WHERE id = ? AND user_id = ?').run(nextAmount, nextCategoryId, req.userId);
    db.prepare(
      'UPDATE transactions SET date = ?, payee = ?, amount = ?, category_id = ?, refund_expected = ? WHERE id = ? AND user_id = ?'
    ).run(nextDate, nextPayee.trim(), nextAmount, nextCategoryId, nextRefundExpected ? 1 : 0, req.params.id, req.userId);
  });
  applyEdit();

  res.json({ transactions: getTransactions(req.userId!), categories: getCategories(req.userId!) });
});

// Toggle whether a transaction is expected to be refunded — doesn't touch the category
// spend total (the charge still happened), it's purely a flag surfaced in the UI so the
// user can mentally net it out without deleting or re-categorizing the record.
api.put('/transactions/:id/refund', (req: AuthedRequest, res) => {  const { refundExpected } = req.body as { refundExpected: boolean };
  if (typeof refundExpected !== 'boolean') return res.status(400).json({ error: 'refundExpected must be a boolean' });
  const result = db
    .prepare('UPDATE transactions SET refund_expected = ? WHERE id = ? AND user_id = ?')
    .run(refundExpected ? 1 : 0, req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ transactions: getTransactions(req.userId!) });
});

api.delete('/transactions/:id', (req: AuthedRequest, res) => {
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  const del = db.transaction(() => {
    db.prepare('UPDATE categories SET spent = MAX(0, spent - ?) WHERE id = ? AND user_id = ?').run(
      tx.amount,
      tx.category_id,
      req.userId
    );
    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  });
  del();
  res.json({ transactions: getTransactions(req.userId!), categories: getCategories(req.userId!) });
});

// Re-run the auto-categorizer against every transaction currently sitting in the user's
// "Uncategorized" bucket. This closes the loop on learning: rules picked up from manual
// edits or later imports weren't retroactively applied to older uncategorized rows until
// the user asked for it — this does that on demand, one click. Only "learned" (high or
// medium confidence) matches are applied automatically; keyword-only or unmatched rows
// are left in Uncategorized rather than guessed into the wrong place.
api.post('/transactions/recategorize', (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const bucket = getOrCreateUncategorized(userId);
  const candidates = db
    .prepare('SELECT id, payee, amount FROM transactions WHERE user_id = ? AND category_id = ?')
    .all(userId, bucket.id) as { id: string; payee: string; amount: number }[];

  if (candidates.length === 0) {
    return res.json({ transactions: getTransactions(userId), categories: getCategories(userId), recategorized: 0 });
  }

  const userCategories = getCategories(userId);
  let moved = 0;
  const run = db.transaction(() => {
    for (const tx of candidates) {
      const suggestion = suggestCategory(userId, tx.payee, userCategories);
      if (suggestion.reason !== 'learned' || !suggestion.categoryId) continue; // don't auto-move on a bare keyword guess
      db.prepare('UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ?').run(suggestion.categoryId, tx.id, userId);
      db.prepare('UPDATE categories SET spent = spent + ? WHERE id = ? AND user_id = ?').run(tx.amount, suggestion.categoryId, userId);
      db.prepare('UPDATE categories SET spent = MAX(0, spent - ?) WHERE id = ? AND user_id = ?').run(tx.amount, bucket.id, userId);
      moved++;
    }
  });
  run();

  res.json({ transactions: getTransactions(userId), categories: getCategories(userId), recategorized: moved });
});

// --- Auto-categorization rules (transparency & control) ---------------------------------
// The learned payee -> category rules are what make repeat imports "just work". Surfacing
// them (and letting the user delete a bad one) keeps the mechanism from being a black box
// — important for trust, especially for anyone wary about automatic statement handling.
api.get('/categories/rules', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT r.id as id, r.payee_key as payeeKey, r.category_id as categoryId, r.hits as hits, r.updated_at as updatedAt,
              c.name as categoryName, c.group_name as categoryGroup
       FROM payee_category_rules r
       JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ?
       ORDER BY r.hits DESC, r.updated_at DESC`
    )
    .all(req.userId) as any[];
  res.json({ rules: rows });
});

api.delete('/categories/rules/:id', (req: AuthedRequest, res) => {
  const result = db.prepare('DELETE FROM payee_category_rules WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Rule not found' });
  res.json({ deleted: true });
});

// --- Statement import ------------------------------------------------------------------
// Two-step flow: the client parses the uploaded file itself (see client/src/lib/csv.ts)
// and only ever sends us the extracted rows — date, payee, amount — never the raw file.
// Step 1 (/statements/categorize) is read-only: it returns a suggested category, a
// confidence level, and a duplicate flag for each row, but writes nothing to the
// database. Step 2 (/statements/import) is the only step that actually creates
// transactions, and only for the rows the user explicitly kept after reviewing them.
const MAX_STATEMENT_ROWS = 1000;

function validateRow(r: any): r is StatementRow {
  return (
    r &&
    typeof r.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    typeof r.payee === 'string' &&
    r.payee.trim().length > 0 &&
    r.payee.length <= 160 &&
    typeof r.amount === 'number' &&
    Number.isFinite(r.amount) &&
    Math.abs(r.amount) <= 100_000_000
  );
}

api.post('/statements/categorize', (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const rows = (req.body as { rows?: unknown[] }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows provided' });
  if (rows.length > MAX_STATEMENT_ROWS) return res.status(400).json({ error: `Too many rows — please import at most ${MAX_STATEMENT_ROWS} at a time` });
  if (!rows.every(validateRow)) return res.status(400).json({ error: 'Each row needs a valid date (YYYY-MM-DD), payee, and amount' });

  const validRows = rows as StatementRow[];
  const userCategories = getCategories(userId);
  const suggestions: CategorySuggestion[] = validRows.map((row) => {
    const suggestion = suggestCategory(userId, row.payee, userCategories);
    const duplicateOf = findDuplicate(userId, row.date, row.payee, row.amount);
    return {
      date: row.date,
      payee: row.payee.trim(),
      amount: row.amount,
      categoryId: suggestion.categoryId,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
      suggestedGroup: suggestion.suggestedGroup,
      isDuplicate: !!duplicateOf,
      duplicateOf,
    };
  });

  res.json({ suggestions });
});

api.post('/statements/import', (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const rows = (req.body as { rows?: unknown[] }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows provided' });
  if (rows.length > MAX_STATEMENT_ROWS) return res.status(400).json({ error: `Too many rows — please import at most ${MAX_STATEMENT_ROWS} at a time` });

  type ImportRow = StatementRow & { categoryId: string };
  const isImportRow = (r: unknown): r is ImportRow => validateRow(r) && typeof (r as any).categoryId === 'string' && (r as any).categoryId.length > 0;
  if (!rows.every(isImportRow)) return res.status(400).json({ error: 'Each row needs a valid date, payee, amount, and category' });
  const importRows: ImportRow[] = (rows as unknown[]).filter(isImportRow);

  const validCategoryIds = new Set(getCategories(userId).map((c) => c.id));
  for (const r of importRows) {
    if (!validCategoryIds.has(r.categoryId)) return res.status(400).json({ error: `Unknown category for "${r.payee}"` });
  }
  const systemCategoryIds = new Set(
    (db.prepare('SELECT id FROM categories WHERE user_id = ? AND is_system = 1').all(userId) as { id: string }[]).map((c) => c.id)
  );

  let imported = 0;
  const run = db.transaction(() => {
    const insertTx = db.prepare('INSERT INTO transactions (id, user_id, date, payee, amount, category_id) VALUES (?,?,?,?,?,?)');
    const bumpSpent = db.prepare('UPDATE categories SET spent = spent + ? WHERE id = ? AND user_id = ?');
    for (const r of importRows) {
      const id = 't_' + randomUUID().slice(0, 8);
      insertTx.run(id, userId, r.date, r.payee.trim(), r.amount, r.categoryId);
      bumpSpent.run(r.amount, r.categoryId, userId);
      // Same rule as manual entry: filing a row under "Uncategorized" isn't a real
      // categorization decision, so it shouldn't overwrite a good learned rule.
      if (!systemCategoryIds.has(r.categoryId)) learnFromCategorization(userId, r.payee.trim(), r.categoryId);
      imported++;
    }
  });
  run();

  res.status(201).json({ transactions: getTransactions(userId), categories: getCategories(userId), imported });
});

api.post('/subscriptions', (req: AuthedRequest, res) => {
  const { name, amount, cadence, nextBillingDate } = req.body as Subscription;
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 120) return res.status(400).json({ error: 'Name is required' });
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return res.status(400).json({ error: 'Invalid amount' });
  const id = 's_' + randomUUID().slice(0, 8);
  db.prepare('INSERT INTO subscriptions (id, user_id, name, amount, cadence, next_billing_date) VALUES (?,?,?,?,?,?)').run(
    id,
    req.userId,
    name.trim(),
    amount,
    cadence || 'Monthly',
    nextBillingDate || null
  );
  res.status(201).json(getSubscriptions(req.userId!));
});

// Edit a subscription. If the amount changed, remember the old amount so the UI can flag a price hike.
api.put('/subscriptions/:id', (req: AuthedRequest, res) => {
  const { name, amount, cadence, nextBillingDate } = req.body as Partial<Subscription>;
  const current = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!current) return res.status(404).json({ error: 'Subscription not found' });

  const nextAmount = typeof amount === 'number' ? amount : current.amount;
  const previousAmount = typeof amount === 'number' && amount !== current.amount ? current.amount : current.previous_amount;

  db.prepare(
    'UPDATE subscriptions SET name = ?, amount = ?, cadence = ?, next_billing_date = ?, previous_amount = ? WHERE id = ? AND user_id = ?'
  ).run(
    name && name.trim() ? name.trim() : current.name,
    nextAmount,
    cadence || current.cadence,
    nextBillingDate !== undefined ? nextBillingDate : current.next_billing_date,
    previousAmount,
    req.params.id,
    req.userId
  );
  res.json(getSubscriptions(req.userId!));
});

api.delete('/subscriptions/:id', (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json(getSubscriptions(req.userId!));
});

api.post('/goals', (req: AuthedRequest, res) => {
  const { name, target } = req.body as Goal;
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 120) return res.status(400).json({ error: 'Name is required' });
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || target > 100_000_000) return res.status(400).json({ error: 'Invalid target' });
  const id = 'g_' + randomUUID().slice(0, 8);
  db.prepare('INSERT INTO goals (id, user_id, name, target, saved) VALUES (?,?,?,?,0)').run(id, req.userId, name.trim(), target);
  res.status(201).json(getGoals(req.userId!));
});

api.put('/goals/:id/add', (req: AuthedRequest, res) => {
  const { amount } = req.body as { amount: number };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return res.status(400).json({ error: 'Invalid amount' });
  const result = db.prepare('UPDATE goals SET saved = saved + ? WHERE id = ? AND user_id = ?').run(amount, req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Goal not found' });
  res.json(getGoals(req.userId!));
});

// Edit a goal's name/target/saved directly, distinct from the "add funds" endpoint above —
// this is for correcting a typo in the name, retargeting after a plan changes, or
// adjusting the saved amount by hand (e.g. after reconciling against a real account)
// rather than only ever incrementing it.
api.put('/goals/:id', (req: AuthedRequest, res) => {
  const { name, target, saved } = req.body as { name?: string; target?: number; saved?: number };
  const current = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!current) return res.status(404).json({ error: 'Goal not found' });

  const nextName = name !== undefined ? name : current.name;
  if (!nextName || typeof nextName !== 'string' || !nextName.trim() || nextName.length > 120) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const nextTarget = target !== undefined ? target : current.target;
  if (typeof nextTarget !== 'number' || !Number.isFinite(nextTarget) || nextTarget <= 0 || nextTarget > 100_000_000) {
    return res.status(400).json({ error: 'Invalid target' });
  }
  const nextSaved = saved !== undefined ? saved : current.saved;
  if (typeof nextSaved !== 'number' || !Number.isFinite(nextSaved) || nextSaved < 0 || nextSaved > 100_000_000) {
    return res.status(400).json({ error: 'Invalid saved amount' });
  }

  db.prepare('UPDATE goals SET name = ?, target = ?, saved = ? WHERE id = ? AND user_id = ?').run(
    nextName.trim(),
    nextTarget,
    nextSaved,
    req.params.id,
    req.userId
  );
  res.json(getGoals(req.userId!));
});

api.delete('/goals/:id', (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json(getGoals(req.userId!));
});

// --- Net worth (accounts + snapshots) ---

api.get('/accounts', (req: AuthedRequest, res) => {
  res.json(getAccounts(req.userId!));
});

api.post('/accounts', (req: AuthedRequest, res) => {
  const { name, type, category, balance, interestRate, minPayment } = req.body as Partial<Account>;
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 120) return res.status(400).json({ error: 'Name required' });
  if (type !== 'asset' && type !== 'liability') return res.status(400).json({ error: 'Type must be asset or liability' });
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0 || balance > 1_000_000_000) return res.status(400).json({ error: 'Invalid balance' });

  const id = 'acc_' + randomUUID().slice(0, 8);
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM accounts WHERE user_id = ?').get(req.userId) as any).m || 0;
  db.prepare(
    'INSERT INTO accounts (id, user_id, name, type, category, balance, interest_rate, min_payment, sort_order) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(
    id,
    req.userId,
    name.trim(),
    type,
    category || 'other',
    balance,
    typeof interestRate === 'number' ? interestRate : null,
    typeof minPayment === 'number' ? minPayment : null,
    maxOrder + 1
  );
  recordSnapshot(req.userId!);
  res.status(201).json({ accounts: getAccounts(req.userId!), netWorthSnapshots: getSnapshots(req.userId!) });
});

api.put('/accounts/:id', (req: AuthedRequest, res) => {
  const current = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!current) return res.status(404).json({ error: 'Account not found' });
  const { name, balance, interestRate, minPayment } = req.body as Partial<Account>;

  db.prepare('UPDATE accounts SET name = ?, balance = ?, interest_rate = ?, min_payment = ? WHERE id = ? AND user_id = ?').run(
    name && name.trim() ? name.trim() : current.name,
    typeof balance === 'number' ? balance : current.balance,
    interestRate !== undefined ? interestRate : current.interest_rate,
    minPayment !== undefined ? minPayment : current.min_payment,
    req.params.id,
    req.userId
  );
  recordSnapshot(req.userId!);
  res.json({ accounts: getAccounts(req.userId!), netWorthSnapshots: getSnapshots(req.userId!) });
});

api.delete('/accounts/:id', (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  recordSnapshot(req.userId!);
  res.json({ accounts: getAccounts(req.userId!), netWorthSnapshots: getSnapshots(req.userId!) });
});

api.get('/networth/snapshots', (req: AuthedRequest, res) => {
  recordSnapshot(req.userId!); // keep today's point current even if the user hasn't touched an account today
  res.json(getSnapshots(req.userId!));
});

// --- Family & Remittances ---
// The differentiator for households sending money across borders: track who you support,
// what actually arrived after fees/FX (not just what you sent), and how much fees cost
// over a year — figures that are otherwise scattered across WhatsApp threads and receipts.

api.get('/recipients', (req: AuthedRequest, res) => {
  res.json(getRecipients(req.userId!));
});

api.post('/recipients', (req: AuthedRequest, res) => {
  const { name, relationship, country, currency, monthlyTarget } = req.body as Partial<Recipient>;
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 120) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (currency && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))) {
    return res.status(400).json({ error: 'Invalid currency' });
  }
  if (monthlyTarget !== undefined && monthlyTarget !== null && (typeof monthlyTarget !== 'number' || !Number.isFinite(monthlyTarget) || monthlyTarget < 0)) {
    return res.status(400).json({ error: 'Invalid monthly target' });
  }
  const id = 'rcp_' + randomUUID().slice(0, 8);
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM recipients WHERE user_id = ?').get(req.userId) as any).m || 0;
  db.prepare(
    'INSERT INTO recipients (id, user_id, name, relationship, country, currency, monthly_target, sort_order) VALUES (?,?,?,?,?,?,?,?)'
  ).run(
    id,
    req.userId,
    name.trim(),
    relationship?.trim() || null,
    country?.trim() || null,
    currency || 'USD',
    typeof monthlyTarget === 'number' ? monthlyTarget : null,
    maxOrder + 1
  );
  res.status(201).json({ recipients: getRecipients(req.userId!), remittances: getRemittances(req.userId!) });
});

api.put('/recipients/:id', (req: AuthedRequest, res) => {
  const current = db.prepare('SELECT * FROM recipients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!current) return res.status(404).json({ error: 'Recipient not found' });
  const { name, relationship, country, currency, monthlyTarget } = req.body as Partial<Recipient>;

  db.prepare(
    'UPDATE recipients SET name = ?, relationship = ?, country = ?, currency = ?, monthly_target = ? WHERE id = ? AND user_id = ?'
  ).run(
    name && name.trim() ? name.trim() : current.name,
    relationship !== undefined ? relationship?.trim() || null : current.relationship,
    country !== undefined ? country?.trim() || null : current.country,
    currency && /^[A-Z]{3}$/.test(currency) ? currency : current.currency,
    monthlyTarget !== undefined ? monthlyTarget : current.monthly_target,
    req.params.id,
    req.userId
  );
  res.json({ recipients: getRecipients(req.userId!), remittances: getRemittances(req.userId!) });
});

api.delete('/recipients/:id', (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM recipients WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ recipients: getRecipients(req.userId!), remittances: getRemittances(req.userId!) });
});

api.post('/remittances', (req: AuthedRequest, res) => {
  const { recipientId, date, amountSent, currencySent, amountReceived, currencyReceived, fee, method, note } =
    req.body as Partial<Remittance>;

  if (!recipientId || typeof recipientId !== 'string') return res.status(400).json({ error: 'Recipient is required' });
  const recipient = db.prepare('SELECT id FROM recipients WHERE id = ? AND user_id = ?').get(recipientId, req.userId);
  if (!recipient) return res.status(400).json({ error: 'Unknown recipient' });

  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'A valid date is required' });
  }
  if (typeof amountSent !== 'number' || !Number.isFinite(amountSent) || amountSent <= 0 || amountSent > 10_000_000) {
    return res.status(400).json({ error: 'Invalid amount sent' });
  }
  if (!currencySent || typeof currencySent !== 'string' || !/^[A-Z]{3}$/.test(currencySent)) {
    return res.status(400).json({ error: 'Invalid currency sent' });
  }
  if (amountReceived !== undefined && amountReceived !== null && (typeof amountReceived !== 'number' || !Number.isFinite(amountReceived) || amountReceived < 0)) {
    return res.status(400).json({ error: 'Invalid amount received' });
  }
  const feeValue = typeof fee === 'number' && Number.isFinite(fee) && fee >= 0 ? fee : 0;

  const id = 'rmt_' + randomUUID().slice(0, 8);
  db.prepare(
    `INSERT INTO remittances (id, user_id, recipient_id, date, amount_sent, currency_sent, amount_received, currency_received, fee, method, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    req.userId,
    recipientId,
    date,
    amountSent,
    currencySent,
    typeof amountReceived === 'number' ? amountReceived : null,
    currencyReceived && /^[A-Z]{3}$/.test(currencyReceived) ? currencyReceived : null,
    feeValue,
    method?.trim() || null,
    note?.trim().slice(0, 500) || null
  );
  res.status(201).json({ recipients: getRecipients(req.userId!), remittances: getRemittances(req.userId!) });
});

api.delete('/remittances/:id', (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM remittances WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ recipients: getRecipients(req.userId!), remittances: getRemittances(req.userId!) });
});

// --- Reports & export ---

api.get('/export/transactions.csv', async (req: AuthedRequest, res) => {
  const { from, to, categoryId } = req.query as { from?: string; to?: string; categoryId?: string };
  const cats = new Map(getCategories(req.userId!).map((c) => [c.id, c]));
  let txs = getTransactions(req.userId!);
  if (from) txs = txs.filter((t) => t.date >= from);
  if (to) txs = txs.filter((t) => t.date <= to);
  if (categoryId) txs = txs.filter((t) => t.categoryId === categoryId);

  // Amounts are stored exactly as the user entered them, in their own account currency —
  // no USD intermediary, no exchange rate involved. The export just mirrors that: one
  // amount column, labeled with the currency it's actually in, nothing to convert or
  // reconcile against a rate.
  const user = getUser(req.userId!);
  const displayCurrency: string = user?.currency || 'USD';

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['Date', 'Payee', 'Category', 'Group', `Amount (${displayCurrency})`];
  const rows = [
    header.join(','),
    ...txs.map((t) => {
      const cat = cats.get(t.categoryId);
      return [t.date, esc(t.payee), esc(cat?.name || 'Unknown'), esc(cat?.group || ''), t.amount.toFixed(2)].join(',');
    }),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="amana-transactions.csv"');
  res.send(rows.join('\n'));
});

api.get('/reports/summary', (req: AuthedRequest, res) => {
  const { from, to, groupBy } = req.query as { from?: string; to?: string; groupBy?: 'category' | 'group' | 'month' | 'payee' };
  const cats = new Map(getCategories(req.userId!).map((c) => [c.id, c]));
  let txs = getTransactions(req.userId!);
  if (from) txs = txs.filter((t) => t.date >= from);
  if (to) txs = txs.filter((t) => t.date <= to);

  const buckets = new Map<string, number>();
  for (const t of txs) {
    const cat = cats.get(t.categoryId);
    let key = 'Unknown';
    if (groupBy === 'group') key = cat?.group || 'Unknown';
    else if (groupBy === 'month') key = t.date.slice(0, 7);
    else if (groupBy === 'payee') key = t.payee;
    else key = cat?.name || 'Unknown';
    buckets.set(key, (buckets.get(key) || 0) + t.amount);
  }
  const data = [...buckets.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  res.json({ data, count: txs.length, total: txs.reduce((s, t) => s + t.amount, 0) });
});

api.post('/demo/seed', (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const existing = db.prepare('SELECT COUNT(*) as n FROM categories WHERE user_id = ?').get(userId) as any;
  if (existing.n > 0) return res.status(409).json({ error: 'Clear or use your existing data first — demo seed only runs on an empty account.' });

  const suffix = userId.slice(-4);
  const seed = db.transaction(() => {
    db.prepare('UPDATE users SET income = 1800 WHERE id = ?').run(userId);

    const categories: [string, string, string, number, number, number][] = [
      ['rent', 'Fixed', 'Rent', 650, 650, 0],
      ['phone', 'Fixed', 'Phone', 45, 45, 1],
      ['subs', 'Fixed', 'Subscriptions', 35, 38, 2],
      ['groceries', 'Everyday', 'Groceries', 220, 168, 3],
      ['dining', 'Everyday', 'Dining Out', 90, 112, 4],
      ['transport', 'Everyday', 'Transport', 60, 41, 5],
      ['emergency', 'Goals & Extras', 'Emergency Fund', 100, 0, 6],
      ['books', 'Goals & Extras', 'Textbooks & Supplies', 80, 0, 7],
      ['fun', 'Goals & Extras', 'Fun Money', 50, 63, 8],
    ];
    const insertCat = db.prepare(
      'INSERT INTO categories (id, user_id, group_name, name, assigned, spent, sort_order) VALUES (?,?,?,?,?,?,?)'
    );
    categories.forEach(([id, group, name, assigned, spent, order]) =>
      insertCat.run(`${id}_${suffix}`, userId, group, name, assigned, spent, order)
    );

    const transactions: [string, string, number, string, string][] = [
      ['2026-07-18', "Trader Joe's", 34.2, 'groceries', 't1'],
      ['2026-07-17', 'Campus Pizza Co.', 18.5, 'dining', 't2'],
      ['2026-07-15', 'Metro Transit Pass', 41.0, 'transport', 't3'],
      ['2026-07-14', 'Spotify', 11.99, 'subs', 't4'],
      ['2026-07-12', 'Netflix', 15.49, 'subs', 't5'],
      ['2026-07-10', 'Landlord Direct Deposit', 650.0, 'rent', 't6'],
      ['2026-07-09', 'Late Night Diner', 22.1, 'dining', 't7'],
      ['2026-07-05', 'Campus Bookstore', 0, 'books', 't8'],
      ['2026-07-03', 'Iron Gym Membership', 10.0, 'subs', 't9'],
      ['2026-07-02', 'Arcade Night', 63.0, 'fun', 't10'],
    ];
    const insertTx = db.prepare('INSERT INTO transactions (id, user_id, date, payee, amount, category_id) VALUES (?,?,?,?,?,?)');
    transactions.forEach(([date, payee, amount, catId, txId]) =>
      insertTx.run(`${txId}_${suffix}`, userId, date, payee, amount, `${catId}_${suffix}`)
    );

    const subs: [string, number][] = [
      ['Spotify', 11.99],
      ['Netflix', 15.49],
      ['Iron Gym', 10.0],
    ];
    const insertSub = db.prepare('INSERT INTO subscriptions (id, user_id, name, amount, cadence) VALUES (?,?,?,?,?)');
    subs.forEach(([name, amount], i) => insertSub.run(`s${i}_${suffix}`, userId, name, amount, 'Monthly'));

    const goals: [string, number, number][] = [
      ['Emergency Fund', 500, 220],
      ['Spring Break Trip', 400, 90],
    ];
    const insertGoal = db.prepare('INSERT INTO goals (id, user_id, name, target, saved) VALUES (?,?,?,?,?)');
    goals.forEach(([name, target, saved], i) => insertGoal.run(`g${i}_${suffix}`, userId, name, target, saved));

    const accounts: [string, string, string, number, number | null, number | null][] = [
      ['Checking', 'asset', 'cash', 640, null, null],
      ['Savings', 'asset', 'cash', 1200, null, null],
      ['Student Loan', 'liability', 'student_loan', 4200, 5.5, 75],
      ['Credit Card', 'liability', 'credit_card', 380, 22.9, 25],
    ];
    const insertAcc = db.prepare(
      'INSERT INTO accounts (id, user_id, name, type, category, balance, interest_rate, min_payment, sort_order) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    accounts.forEach(([name, type, category, balance, rate, minPay], i) =>
      insertAcc.run(`acc${i}_${suffix}`, userId, name, type, category, balance, rate, minPay, i)
    );

    const insertRecipient = db.prepare(
      'INSERT INTO recipients (id, user_id, name, relationship, country, currency, monthly_target, sort_order) VALUES (?,?,?,?,?,?,?,?)'
    );
    insertRecipient.run(`rcp0_${suffix}`, userId, 'Mama', 'Mother', 'Kenya', 'KES', 150, 0);
    insertRecipient.run(`rcp1_${suffix}`, userId, 'David', 'Brother — school fees', 'Kenya', 'KES', 80, 1);

    const insertRemit = db.prepare(
      `INSERT INTO remittances (id, user_id, recipient_id, date, amount_sent, currency_sent, amount_received, currency_received, fee, method, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    );
    insertRemit.run(`rmt0_${suffix}`, userId, `rcp0_${suffix}`, '2026-07-05', 150, 'USD', 19420, 'KES', 4.99, 'Wise', 'Monthly support');
    insertRemit.run(`rmt1_${suffix}`, userId, `rcp1_${suffix}`, '2026-06-28', 80, 'USD', 10330, 'KES', 3.5, 'Wise', 'Term fees');
    insertRemit.run(`rmt2_${suffix}`, userId, `rcp0_${suffix}`, '2026-06-05', 150, 'USD', 19180, 'KES', 4.99, 'Wise', 'Monthly support');
  });
  seed();
  recordSnapshot(userId);

  res.status(201).json(getFullState(userId));
});
