import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../auth';
import { memberSnapshot, generateShortCode } from '../snapshot';

export const household = Router();

// GET /preview/:code — deliberately public (registered before requireAuth below) so a
// shared invite link can show "You've been invited to join The Ochieng household" on the
// sign-up screen itself, before the person has an account to authenticate with. Returns
// only the household's name and member count — nothing about its members or finances.
household.get('/preview/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Invite code required' });
  const h = db.prepare('SELECT id, name FROM households WHERE invite_code = ?').get(code) as any;
  if (!h) return res.status(404).json({ error: "That invite code doesn't match a household" });
  const memberCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE household_id = ?').get(h.id) as any).c;
  res.json({ name: h.name, memberCount });
});

household.use(requireAuth);

function getHouseholdPayload(householdId: string) {
  const h = db.prepare('SELECT id, name, invite_code as inviteCode, owner_id as ownerId FROM households WHERE id = ?').get(householdId) as any;
  if (!h) return null;
  const memberRows = db.prepare('SELECT id FROM users WHERE household_id = ?').all(householdId) as { id: string }[];
  const members = memberRows.map((m) => memberSnapshot(m.id)).filter(Boolean);
  return { ...h, members };
}

// GET / — the current user's household (members, invite code) or null if they're not in one.
household.get('/', (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId) as any;
  if (!user?.household_id) return res.json({ household: null });
  const payload = getHouseholdPayload(user.household_id);
  res.json({ household: payload });
});

// POST /create { name } — starts a new household with the current user as owner.
household.post('/create', (req: AuthedRequest, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim() || name.length > 80) {
    return res.status(400).json({ error: 'Household name is required' });
  }
  const current = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId) as any;
  if (current?.household_id) return res.status(409).json({ error: 'You already belong to a household — leave it first.' });

  const id = 'h_' + randomUUID().slice(0, 10);
  let code = generateShortCode();
  // Vanishingly unlikely, but guard against a collision on the unique invite_code column.
  while (db.prepare('SELECT 1 FROM households WHERE invite_code = ?').get(code)) code = generateShortCode();

  db.prepare('INSERT INTO households (id, name, invite_code, owner_id) VALUES (?,?,?,?)').run(id, name.trim(), code, req.userId);
  db.prepare('UPDATE users SET household_id = ?, household_role = ? WHERE id = ?').run(id, 'owner', req.userId);

  res.status(201).json({ household: getHouseholdPayload(id) });
});

// POST /join { inviteCode }
household.post('/join', (req: AuthedRequest, res) => {
  const { inviteCode } = req.body as { inviteCode?: string };
  if (!inviteCode || typeof inviteCode !== 'string') return res.status(400).json({ error: 'Enter an invite code' });
  const current = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId) as any;
  if (current?.household_id) return res.status(409).json({ error: 'You already belong to a household — leave it first.' });

  const h = db.prepare('SELECT id FROM households WHERE invite_code = ?').get(inviteCode.trim().toUpperCase()) as any;
  if (!h) return res.status(404).json({ error: "That invite code doesn't match a household" });

  const memberCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE household_id = ?').get(h.id) as any).c;
  if (memberCount >= 12) return res.status(400).json({ error: 'This household is full' });

  db.prepare('UPDATE users SET household_id = ?, household_role = ? WHERE id = ?').run(h.id, 'member', req.userId);
  res.json({ household: getHouseholdPayload(h.id) });
});

// POST /leave — members just leave; if the owner leaves and others remain, ownership passes
// to whoever joined earliest so the household keeps functioning without an explicit transfer step.
household.post('/leave', (req: AuthedRequest, res) => {
  const current = db.prepare('SELECT household_id, household_role FROM users WHERE id = ?').get(req.userId) as any;
  if (!current?.household_id) return res.status(400).json({ error: "You're not in a household" });
  const householdId = current.household_id;

  db.prepare('UPDATE users SET household_id = NULL, household_role = NULL WHERE id = ?').run(req.userId);

  const remaining = db.prepare('SELECT id FROM users WHERE household_id = ? ORDER BY rowid ASC').all(householdId) as { id: string }[];
  if (remaining.length === 0) {
    db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
  } else if (current.household_role === 'owner') {
    const next = remaining[0].id;
    db.prepare('UPDATE households SET owner_id = ? WHERE id = ?').run(next, householdId);
    db.prepare('UPDATE users SET household_role = ? WHERE id = ?').run('owner', next);
  }

  res.status(204).end();
});

// POST /regenerate-code — owner-only, invalidates the old invite code.
household.post('/regenerate-code', (req: AuthedRequest, res) => {
  const current = db.prepare('SELECT household_id, household_role FROM users WHERE id = ?').get(req.userId) as any;
  if (!current?.household_id) return res.status(400).json({ error: "You're not in a household" });
  if (current.household_role !== 'owner') return res.status(403).json({ error: 'Only the household owner can do that' });

  let code = generateShortCode();
  while (db.prepare('SELECT 1 FROM households WHERE invite_code = ?').get(code)) code = generateShortCode();
  db.prepare('UPDATE households SET invite_code = ? WHERE id = ?').run(code, current.household_id);
  res.json({ household: getHouseholdPayload(current.household_id) });
});
