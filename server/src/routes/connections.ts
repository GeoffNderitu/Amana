import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../auth';
import { memberSnapshot, generateShortCode } from '../snapshot';

export const connections = Router();

// GET /preview/:code — public, same reasoning as the household preview endpoint: a shared
// connect link needs to show who's on the other end ("Amina wants to connect") on the
// sign-up screen itself, before the visitor has an account. Name and avatar only.
connections.get('/preview/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Connect code required' });
  const user = db.prepare('SELECT id, name, avatar_emoji, avatar_color, avatar_image FROM users WHERE connect_code = ?').get(code) as any;
  if (!user) return res.status(404).json({ error: "That connect code doesn't match anyone" });
  res.json({ name: user.name, avatarEmoji: user.avatar_emoji, avatarColor: user.avatar_color, avatarImage: user.avatar_image });
});

connections.use(requireAuth);

// A pair is always stored with the lexicographically smaller id first, so there's exactly
// one row per pair no matter who initiated it, and lookups don't need an OR-of-both-orders
// query pattern sprinkled everywhere.
function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function ensureConnectCode(userId: string): string {
  const row = db.prepare('SELECT connect_code FROM users WHERE id = ?').get(userId) as any;
  if (row?.connect_code) return row.connect_code;
  let code = generateShortCode();
  while (db.prepare('SELECT 1 FROM users WHERE connect_code = ?').get(code)) code = generateShortCode();
  db.prepare('UPDATE users SET connect_code = ? WHERE id = ?').run(code, userId);
  return code;
}

function listConnections(userId: string) {
  const rows = db
    .prepare('SELECT user_a_id as a, user_b_id as b FROM connections WHERE user_a_id = ? OR user_b_id = ? ORDER BY created_at DESC')
    .all(userId, userId) as { a: string; b: string }[];
  return rows
    .map((r) => (r.a === userId ? r.b : r.a))
    .map((otherId) => memberSnapshot(otherId))
    .filter(Boolean);
}

// GET / — everyone the current user is connected to, plus their own shareable code.
connections.get('/', (req: AuthedRequest, res) => {
  const code = ensureConnectCode(req.userId!);
  res.json({ code, connections: listConnections(req.userId!) });
});

// POST /join { code } — pairs the current user with whoever owns that connect code.
// Immediate and mutual, same as household join: no approval step, matching the rest of the
// app's "possession of the code is the permission" model.
connections.post('/join', (req: AuthedRequest, res) => {
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Enter a connect code' });

  const other = db.prepare('SELECT id, name FROM users WHERE connect_code = ?').get(code.trim().toUpperCase()) as any;
  if (!other) return res.status(404).json({ error: "That connect code doesn't match anyone" });
  if (other.id === req.userId) return res.status(400).json({ error: "That's your own code" });

  const [a, b] = pairKey(req.userId!, other.id);
  const existing = db.prepare('SELECT 1 FROM connections WHERE user_a_id = ? AND user_b_id = ?').get(a, b);
  if (existing) return res.status(409).json({ error: `You're already connected with ${other.name}` });

  const id = 'conn_' + randomUUID().slice(0, 10);
  db.prepare('INSERT INTO connections (id, user_a_id, user_b_id) VALUES (?,?,?)').run(id, a, b);

  const code2 = ensureConnectCode(req.userId!);
  res.status(201).json({ code: code2, connections: listConnections(req.userId!) });
});

// DELETE /:otherId — unpair. Either side can remove the connection.
connections.delete('/:otherId', (req: AuthedRequest, res) => {
  const otherId = String(req.params.otherId);
  const [a, b] = pairKey(req.userId!, otherId);
  const result = db.prepare('DELETE FROM connections WHERE user_a_id = ? AND user_b_id = ?').run(a, b);
  if (result.changes === 0) return res.status(404).json({ error: 'Not connected with that person' });
  res.json({ connections: listConnections(req.userId!) });
});

// POST /regenerate-code — invalidates the old code (anyone who still has it can no longer
// use it to connect) without touching any connections that already exist.
connections.post('/regenerate-code', (req: AuthedRequest, res) => {
  let code = generateShortCode();
  while (db.prepare('SELECT 1 FROM users WHERE connect_code = ?').get(code)) code = generateShortCode();
  db.prepare('UPDATE users SET connect_code = ? WHERE id = ?').run(code, req.userId);
  res.json({ code, connections: listConnections(req.userId!) });
});
