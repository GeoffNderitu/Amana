import { Router } from 'express';
import { randomUUID, randomBytes, createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { hashPassword, comparePassword, signToken, requireAuth, setSessionCookie, clearSessionCookie, type AuthedRequest } from '../auth';
import { sendPasswordResetEmail } from '../mailer';
import { convertUserMoneyFigures } from '../migrateStorageCurrency';

export const authRoutes = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IS_PROD = process.env.NODE_ENV === 'production';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Slow down credential-stuffing / brute-force attempts against login and signup.
// Keyed by IP; generous enough for a mistyped password, tight enough to blunt automation.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Looser than authLimiter's login/signup ceiling would need to be, but still tight enough
// that someone can't hammer the forgot-password endpoint to spam an inbox or brute-force
// tokens (which are also individually rate-limited by sheer entropy + expiry + one-time use).
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

function hashToken(token: string): string {
  // Reset tokens are 32 random bytes (256 bits of entropy) generated server-side, unlike
  // user-chosen passwords, so a fast, deterministic hash is appropriate here — bcrypt's
  // slow, salted design defends against guessing low-entropy secrets, which doesn't apply
  // to a token like this, and a deterministic hash is what lets us look it up by value.
  return createHash('sha256').update(token).digest('hex');
}

function bumpTokenVersion(userId: string): number {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
  const row = db.prepare('SELECT token_version FROM users WHERE id = ?').get(userId) as { token_version: number };
  return row.token_version;
}

function publicUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    currency: row.currency,
    income: row.income,
    unassignedExtra: row.unassigned_extra,
    theme: row.theme,
    avatarEmoji: row.avatar_emoji,
    avatarColor: row.avatar_color,
    avatarImage: row.avatar_image,
    accentColor: row.accent_color,
    colorMode: row.color_mode,
    householdId: row.household_id,
    householdRole: row.household_role,
  };
}

authRoutes.post('/signup', authLimiter, (req, res) => {
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 120) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const id = 'u_' + randomUUID().slice(0, 10);
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, currency, income, unassigned_extra) VALUES (?,?,?,?,?,0,0)'
  ).run(id, email.toLowerCase(), hashPassword(password), name.trim(), 'USD');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const token = signToken(id, 0);
  setSessionCookie(res, token);
  res.status(201).json({ user: publicUser(user) });
});

authRoutes.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as any;
  if (!row || !comparePassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  const token = signToken(row.id, row.token_version ?? 0);
  setSessionCookie(res, token);
  res.json({ user: publicUser(row) });
});

authRoutes.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRoutes.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(row) });
});

const THEMES = ['violet', 'ocean', 'sunset', 'forest', 'midnight', 'rose', 'sand', 'berry'];
const AVATAR_COLORS = ['brand', 'emerald', 'clay', 'gold', 'rose', 'sky'];
const COLOR_MODES = ['light', 'dark', 'system'];
const EMOJI_RE = /^\p{Extended_Pictographic}$/u;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// Uploaded avatars are resized to a small square on the client before upload, so this
// cap (~350KB of base64) comfortably fits a decent-quality image while keeping row size sane.
const MAX_AVATAR_IMAGE_LENGTH = 350_000;
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/;

authRoutes.put('/profile', requireAuth, async (req: AuthedRequest, res) => {
  const { name, currency, income, theme, avatarEmoji, avatarColor, avatarImage, accentColor, clearAvatarImage, clearAccentColor, colorMode } = req.body as {
    name?: string;
    currency?: string;
    income?: number;
    theme?: string;
    avatarEmoji?: string;
    avatarColor?: string;
    avatarImage?: string;
    accentColor?: string;
    clearAvatarImage?: boolean;
    clearAccentColor?: boolean;
    colorMode?: string;
  };
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!current) return res.status(404).json({ error: 'User not found' });

  const nextCurrency = currency && /^[A-Z]{3}$/.test(currency) ? currency : current.currency;

  // Currency here isn't just a display label — every amount is stored directly in it. If
  // the person switches currency, their existing figures need to move with them (using
  // today's rate) or a KES 6,500 grocery run would suddenly read as $6,500. If a live rate
  // isn't available right now, the currency switch itself is rejected rather than silently
  // relabeling everything at the wrong scale.
  if (nextCurrency !== current.currency) {
    const factor = await convertUserMoneyFigures(req.userId!, current.currency, nextCurrency);
    if (factor === null) {
      return res.status(502).json({ error: 'Could not fetch a live exchange rate to convert your existing figures — try again in a moment.' });
    }
  }
  const post = nextCurrency !== current.currency ? (db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any) : current;

  const nextName = name && name.trim() ? name.trim() : current.name;
  const nextIncome = typeof income === 'number' && income >= 0 ? income : post.income;
  const nextTheme = theme && THEMES.includes(theme) ? theme : current.theme;
  const nextColorMode = colorMode && COLOR_MODES.includes(colorMode) ? colorMode : current.color_mode;
  const nextAvatarEmoji = avatarEmoji && EMOJI_RE.test(avatarEmoji) ? avatarEmoji : current.avatar_emoji;
  const nextAvatarColor = avatarColor && AVATAR_COLORS.includes(avatarColor) ? avatarColor : current.avatar_color;

  let nextAvatarImage = current.avatar_image;
  if (clearAvatarImage) {
    nextAvatarImage = null;
  } else if (avatarImage) {
    if (typeof avatarImage !== 'string' || avatarImage.length > MAX_AVATAR_IMAGE_LENGTH || !DATA_URL_RE.test(avatarImage)) {
      return res.status(400).json({ error: 'Photo is too large or not a supported image format' });
    }
    nextAvatarImage = avatarImage;
  }

  let nextAccentColor = current.accent_color;
  if (clearAccentColor) {
    nextAccentColor = null;
  } else if (accentColor) {
    if (typeof accentColor !== 'string' || !HEX_COLOR_RE.test(accentColor)) {
      return res.status(400).json({ error: 'Accent color must be a hex code like #6d28d9' });
    }
    nextAccentColor = accentColor;
  }

  db.prepare(
    'UPDATE users SET name = ?, currency = ?, income = ?, theme = ?, avatar_emoji = ?, avatar_color = ?, avatar_image = ?, accent_color = ?, color_mode = ? WHERE id = ?'
  ).run(
    nextName,
    nextCurrency,
    nextIncome,
    nextTheme,
    nextAvatarEmoji,
    nextAvatarColor,
    nextAvatarImage,
    nextAccentColor,
    nextColorMode,
    req.userId
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(updated) });
});

// --- Change email (authenticated, requires current password) ---
// Accept both the original REST route and the POST route. POST is intentionally used by
// the client because it is more reliably preserved by simple reverse proxies and PWA
// deployments than PUT/DELETE, which were reaching the API's catch-all 404 in some hosts.
authRoutes.all(['/email', '/change-email'], requireAuth, (req: AuthedRequest, res) => {
  const { newEmail, currentPassword } = req.body as { newEmail?: string; currentPassword?: string };
  if (!newEmail || typeof newEmail !== 'string' || !EMAIL_RE.test(newEmail) || newEmail.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Enter your current password to confirm this change' });
  }

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!current) return res.status(404).json({ error: 'User not found' });
  if (!comparePassword(currentPassword, current.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const normalized = newEmail.toLowerCase();
  if (normalized === current.email) {
    return res.status(400).json({ error: 'That’s already your email address' });
  }
  const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(normalized, req.userId);
  if (taken) return res.status(409).json({ error: 'An account with that email already exists' });

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(normalized, req.userId);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(updated) });
});

// --- Change password (authenticated, requires current password) ---
authRoutes.all(['/password', '/change-password'], requireAuth, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Enter your current password' });
  }
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!current) return res.status(404).json({ error: 'User not found' });
  if (!comparePassword(currentPassword, current.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (comparePassword(newPassword, current.password_hash)) {
    return res.status(400).json({ error: 'New password must be different from your current password' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.userId);
  // Also retire any outstanding "forgot password" reset link — if one was requested and
  // never used, a password change through this authenticated flow makes it stale.
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(req.userId);
  // Bumping token_version invalidates every other signed-in session/device immediately.
  // Re-sign and re-set the cookie for *this* request so the person isn't logged out of
  // the tab they just changed their password from.
  const nextVersion = bumpTokenVersion(req.userId as string);
  const token = signToken(req.userId as string, nextVersion);
  setSessionCookie(res, token);
  res.status(204).end();
});

// --- Forgot password: request a reset link ---
// Always responds with the same generic message whether or not the email is on file, so
// this endpoint can't be used to check which emails have an Amana account.
authRoutes.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };
  const generic = { message: "If an account exists for that email, we've sent a link to reset the password." };

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase()) as
    | { id: string; email: string }
    | undefined;

  if (!user) {
    return res.json(generic);
  }

  // Only one live reset link per account at a time — issuing a new one retires any
  // earlier, unused link instead of leaving multiple valid tokens floating around.
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0').run(user.id);

  const token = randomBytes(32).toString('hex');
  const id = 'prt_' + randomUUID().slice(0, 10);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  db.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)').run(
    id,
    user.id,
    hashToken(token),
    expiresAt
  );

  const resetUrl = `${CLIENT_ORIGIN}/?reset=${token}`;
  await sendPasswordResetEmail(user.email, resetUrl);

  // In production, only the generic message goes back — the link itself only ever
  // travels over email. Outside production (no mail provider wired up yet), the link is
  // also returned in the response so the whole flow is testable without extra setup;
  // it's already been written to the server log either way.
  if (!IS_PROD) {
    return res.json({ ...generic, resetUrl, devNote: 'Shown only outside production — see server logs otherwise.' });
  }
  res.json(generic);
});

// --- Forgot password: consume the token and set a new password ---
authRoutes.post('/reset-password', resetLimiter, (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Reset link is missing or malformed' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const tokenHash = hashToken(token);
  const row = db
    .prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0')
    .get(tokenHash) as any;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password as string), row.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(row.id);
  // Also retire any other outstanding reset tokens for this user, and sign out every
  // other session — a password reset is a strong signal the old password may have been
  // compromised, so anything issued before this moment should stop working.
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?').run(row.user_id, row.id);
  const nextVersion = bumpTokenVersion(row.user_id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as any;
  const newToken = signToken(row.user_id, nextVersion);
  setSessionCookie(res, newToken);
  res.json({ user: publicUser(updated) });
});

// --- Delete account (authenticated, requires current password) ---
authRoutes.all(['/account', '/delete-account'], requireAuth, (req: AuthedRequest, res) => {
  const { password } = req.body as { password?: string };
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Enter your password to confirm account deletion' });
  }
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!current) return res.status(404).json({ error: 'User not found' });
  if (!comparePassword(password, current.password_hash)) {
    return res.status(401).json({ error: 'Password is incorrect' });
  }

  // Household membership and one-to-one connections are tracked by columns/rows that
  // reference the user without a cascading FK, so tidy those up first — same behavior as
  // the explicit "leave household" flow: ownership passes on, or the household is
  // removed if this was the last member. Everything else (categories, transactions,
  // goals, accounts, remittances, reset tokens, etc.) cascades automatically.
  if (current.household_id) {
    const remaining = db
      .prepare('SELECT id FROM users WHERE household_id = ? AND id != ? ORDER BY rowid ASC')
      .all(current.household_id, req.userId) as { id: string }[];
    if (remaining.length === 0) {
      db.prepare('DELETE FROM households WHERE id = ?').run(current.household_id);
    } else if (current.household_role === 'owner') {
      db.prepare('UPDATE households SET owner_id = ? WHERE id = ?').run(remaining[0].id, current.household_id);
      db.prepare('UPDATE users SET household_role = ? WHERE id = ?').run('owner', remaining[0].id);
    }
  }
  db.prepare('DELETE FROM connections WHERE user_a_id = ? OR user_b_id = ?').run(req.userId, req.userId);

  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  clearSessionCookie(res);
  res.status(204).end();
});
