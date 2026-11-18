import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || 'ugabyte-commerce-dev-session-secret-change-in-prod';
export const COOKIE_NAME = 'ugabyte_session';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  district: string | null;
  role: 'customer' | 'merchant' | 'admin';
  account_status?: 'active' | 'suspended';
}

export interface AuthedRequest extends Request {
  user?: AuthUser | null;
}

export function signSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsed.uid === 'string' ? parsed.uid : null;
  } catch {
    return null;
  }
}

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return undefined;
}

export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : undefined;
  const cookieToken = parseCookie(req.headers.cookie, COOKIE_NAME);
  const uid = verifySessionToken(bearer || cookieToken);
  if (!uid) {
    req.user = null;
    return next();
  }
  const user = db
    .prepare('SELECT id, email, full_name, phone, district, role, account_status FROM users WHERE id = ?')
    .get(uid) as AuthUser | undefined;
  if (!user || user.account_status === 'suspended') {
    req.user = null;
    return next();
  }
  req.user = user;
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin permissions required.' });
  }
  next();
}

export function isStoreMember(storeId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT id FROM store_members WHERE store_id = ? AND user_id = ?')
    .get(storeId, userId);
  return Boolean(row);
}
