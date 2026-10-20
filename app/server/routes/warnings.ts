import { Router } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { authSessions, users, warnings } from '../db/schema';
import { HttpError, requireUser } from '../auth';
import type { Ctx } from '../context';
import { nowIso, uid } from '../services';
import { nameMap } from '../views';
import { WARNING_LIMIT } from '../../shared/vocab';

export function warningRoutes(ctx: Ctx) {
  const { db } = ctx;
  const r = Router();

  function warningViews(rows: (typeof warnings.$inferSelect)[], showIssuer: boolean) {
    const who = nameMap(db, rows.flatMap((w) => [w.issuedBy, w.removedBy]));
    return rows.map((w) => ({
      id: w.id,
      reason: w.reason,
      at: w.at,
      active: !w.removedAt,
      removedAt: w.removedAt,
      ...(showIssuer && { issuedBy: w.issuedBy ? who(w.issuedBy).name : null, removedBy: w.removedBy ? who(w.removedBy).name : null }),
    }));
  }

  const active = (userId: string) =>
    db.select({ id: warnings.id }).from(warnings).where(and(eq(warnings.userId, userId), isNull(warnings.removedAt))).all().length;

  /** The signed-in user's own warnings, so they can see how close they are to a ban. */
  r.get('/me/warnings', (req, res) => {
    const me = requireUser(req);
    const rows = db.select().from(warnings).where(eq(warnings.userId, me.id)).orderBy(desc(warnings.at)).all();
    res.json({ limit: WARNING_LIMIT, active: rows.filter((w) => !w.removedAt).length, warnings: warningViews(rows, false) });
  });

  r.get('/admin/users/:id/warnings', (req, res) => {
    requireUser(req, 'admin');
    const u = db.select().from(users).where(eq(users.id, req.params.id)).get();
    if (!u || u.role === 'admin') throw new HttpError(404, 'Account not found.');
    const rows = db.select().from(warnings).where(eq(warnings.userId, u.id)).orderBy(desc(warnings.at)).all();
    res.json({ limit: WARNING_LIMIT, status: u.status, active: rows.filter((w) => !w.removedAt).length, warnings: warningViews(rows, true) });
  });

  /** Issues a warning. Reaching the limit bans the account and signs it out everywhere. */
  r.post('/admin/users/:id/warnings', (req, res) => {
    const admin = requireUser(req, 'admin');
    const { reason } = z.object({ reason: z.string().trim().min(5, 'Say why you’re warning this user.').max(1000) }).parse(req.body);
    const result = db.transaction((tx) => {
      const u = tx.select().from(users).where(eq(users.id, req.params.id)).get();
      if (!u || u.role === 'admin') throw new HttpError(404, 'Account not found.');
      tx.insert(warnings).values({ id: uid('w_'), userId: u.id, issuedBy: admin.id, reason, at: nowIso() }).run();
      const count = tx.select({ id: warnings.id }).from(warnings).where(and(eq(warnings.userId, u.id), isNull(warnings.removedAt))).all().length;
      const banned = count >= WARNING_LIMIT && u.status !== 'banned';
      if (banned) {
        tx.update(users).set({ status: 'banned' }).where(eq(users.id, u.id)).run();
        tx.delete(authSessions).where(eq(authSessions.userId, u.id)).run();
      }
      return { count, banned };
    }, { behavior: 'immediate' });
    res.status(201).json({ ...result, limit: WARNING_LIMIT });
  });

  /** Removes a warning from the count. A ban stays until an admin reactivates the account. */
  r.post('/admin/warnings/:id/remove', (req, res) => {
    const admin = requireUser(req, 'admin');
    const w = db.select().from(warnings).where(eq(warnings.id, req.params.id)).get();
    if (!w) throw new HttpError(404, 'Warning not found.');
    if (w.removedAt) throw new HttpError(409, 'This warning was already removed.');
    db.update(warnings).set({ removedAt: nowIso(), removedBy: admin.id }).where(eq(warnings.id, w.id)).run();
    res.json({ ok: true, active: active(w.userId) });
  });

  return r;
}
