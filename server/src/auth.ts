import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';

const IS_PROD = process.env.NODE_ENV === 'production';
const INSECURE_DEFAULT = 'dev-secret-change-in-production';

// Fail fast rather than silently signing production sessions with a known, public default secret.
const JWT_SECRET = process.env.JWT_SECRET || INSECURE_DEFAULT;
if (IS_PROD && JWT_SECRET === INSECURE_DEFAULT) {
  throw new Error(
    'JWT_SECRET is not set. Refusing to start in production with the default secret — set a long random JWT_SECRET in your environment.'
  );
}

export const SESSION_COOKIE = 'amana_session';
const JWT_EXPIRES_IN = '30d';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

// tokenVersion is stamped from users.token_version at sign time. Changing a password
// (self-service or via reset) bumps that column, which makes every previously-issued
// token fail the check in requireAuth below — a lightweight way to invalidate other
// sessions/devices without a server-side session table.
export function signToken(userId: string, tokenVersion = 0): string {
  return jwt.sign({ userId, tokenVersion }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Sessions live in an httpOnly cookie so a client-side script (e.g. an XSS payload)
// can never read the token, unlike the previous localStorage approach.
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/' });
}

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // Cookie is the primary path (browser client). A Bearer header is still accepted so the
  // API can be scripted/tested directly without a cookie jar.
  const cookieToken = (req as any).cookies?.[SESSION_COOKIE];
  const header = req.headers.authorization;
  const headerToken = header && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; tokenVersion?: number };
    const row = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.userId) as
      | { token_version: number }
      | undefined;
    if (!row) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    // A token signed before the current token_version (i.e. before the most recent
    // password change) is a session from before that change and must be rejected.
    if ((payload.tokenVersion ?? 0) !== row.token_version) {
      return res.status(401).json({ error: 'Your session has expired because your password changed. Please sign in again.' });
    }
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
