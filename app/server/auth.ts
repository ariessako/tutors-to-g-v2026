import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db';
import { authSessions, users } from './db/schema';
import type { Role } from '../shared/types';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'ttg_session';
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(key, expected);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a login session and sets its cookie. Only a hash of the token is stored. */
export function startSession(db: Db, res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  db.insert(authSessions)
    .values({ tokenHash: tokenHash(token), userId, createdAt: now.toISOString(), expiresAt: expires.toISOString() })
    .run();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
    path: '/',
  });
}

export function endSession(db: Db, req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash(token))).run();
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export type User = typeof users.$inferSelect;

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

/** Attaches req.user when the cookie belongs to a live session of an active account. */
export function loadUser(db: Db) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const row = db
        .select({ user: users, expiresAt: authSessions.expiresAt })
        .from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(eq(authSessions.tokenHash, tokenHash(token)))
        .get();
      if (row && row.expiresAt > new Date().toISOString() && row.user.status === 'active') req.user = row.user;
    }
    next();
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Returns the signed-in user, or throws 401/403 when missing or not one of `roles`. */
export function requireUser(req: Request, ...roles: Role[]): User {
  if (!req.user) throw new HttpError(401, 'Log in to continue.');
  if (roles.length && !roles.includes(req.user.role)) throw new HttpError(403, 'You don’t have access to this.');
  return req.user;
}
