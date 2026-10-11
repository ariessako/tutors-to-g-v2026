import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { parentLinks, users } from '../db/schema';
import { HttpError, requireUser } from '../auth';
import { emailSchema, type Ctx } from '../context';
import { nowIso, uid } from '../services';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Starts a link request from a parent to the student with `email`. Throws when
 * no active student uses that email or a request for the pair is still open.
 */
export function requestLink(tx: Db | Tx, parentId: string, email: string) {
  const student = tx
    .select()
    .from(users)
    .where(and(eq(users.role, 'student'), eq(users.status, 'active'), sql`lower(${users.email}) = ${email}`))
    .get();
  if (!student) throw new HttpError(404, 'No student account uses that email. Ask your child for the email they signed up with.');
  const open = tx
    .select({ status: parentLinks.status })
    .from(parentLinks)
    .where(and(eq(parentLinks.parentId, parentId), eq(parentLinks.studentId, student.id), inArray(parentLinks.status, ['pending_student', 'pending_admin', 'approved'])))
    .get();
  if (open) throw new HttpError(409, open.status === 'approved' ? `You’re already linked to ${student.name}.` : `You already asked to link ${student.name}.`);
  tx.insert(parentLinks).values({ id: uid('pl_'), parentId, studentId: student.id, status: 'pending_student', requestedAt: nowIso() }).run();
  return student;
}

export function linkRoutes(ctx: Ctx) {
  const { db } = ctx;
  const r = Router();

  function linkViews(rows: (typeof parentLinks.$inferSelect)[]) {
    const ids = rows.flatMap((l) => [l.parentId, l.studentId]);
    const people = ids.length ? db.select().from(users).where(inArray(users.id, ids)).all() : [];
    // Links are deleted with either account, so both people always exist.
    const person = (id: string) => {
      const u = people.find((p) => p.id === id)!;
      return { id: u.id, name: u.name, email: u.email, gradeLabel: u.gradeLabel };
    };
    return rows.map((l) => ({
      id: l.id,
      parent: person(l.parentId),
      student: person(l.studentId),
      status: l.status,
      declinedBy: l.declinedBy,
      requestedAt: l.requestedAt,
      studentAt: l.studentAt,
      adminAt: l.adminAt,
    }));
  }

  function findLink(id: string) {
    const link = db.select().from(parentLinks).where(eq(parentLinks.id, id)).get();
    if (!link) throw new HttpError(404, 'Link request not found.');
    return link;
  }

  // Parents
  r.get('/parent/links', (req, res) => {
    const me = requireUser(req, 'parent');
    const rows = db.select().from(parentLinks).where(eq(parentLinks.parentId, me.id)).orderBy(desc(parentLinks.requestedAt)).all();
    res.json({ links: linkViews(rows) });
  });

  r.post('/parent/links', (req, res) => {
    const me = requireUser(req, 'parent');
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const student = db.transaction((tx) => requestLink(tx, me.id, email), { behavior: 'immediate' });
    res.status(201).json({ student: student.name });
  });

  // Students
  r.get('/student/parent-links', (req, res) => {
    const me = requireUser(req, 'student');
    const rows = db
      .select()
      .from(parentLinks)
      .where(and(eq(parentLinks.studentId, me.id), inArray(parentLinks.status, ['pending_student', 'pending_admin', 'approved'])))
      .orderBy(desc(parentLinks.requestedAt))
      .all();
    res.json({ links: linkViews(rows) });
  });

  r.post('/student/parent-links/:id', (req, res) => {
    const me = requireUser(req, 'student');
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    db.transaction((tx) => {
      const link = findLink(String(req.params.id));
      if (link.studentId !== me.id) throw new HttpError(404, 'Link request not found.');
      if (link.status !== 'pending_student') throw new HttpError(409, 'You already answered this request.');
      tx.update(parentLinks)
        .set(accept ? { status: 'pending_admin', studentAt: nowIso() } : { status: 'declined', declinedBy: 'student', studentAt: nowIso() })
        .where(eq(parentLinks.id, link.id))
        .run();
    }, { behavior: 'immediate' });
    res.json({ ok: true });
  });

  // Admins
  r.get('/admin/parent-links', (req, res) => {
    requireUser(req, 'admin');
    const rows = db.select().from(parentLinks).orderBy(desc(parentLinks.requestedAt)).all();
    res.json({ links: linkViews(rows) });
  });

  r.post('/admin/parent-links/:id', (req, res) => {
    requireUser(req, 'admin');
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    db.transaction((tx) => {
      const link = findLink(String(req.params.id));
      if (link.status !== 'pending_admin') throw new HttpError(409, link.status === 'pending_student' ? 'The student hasn’t confirmed this request yet.' : 'This request was already decided.');
      tx.update(parentLinks)
        .set(approve ? { status: 'approved', adminAt: nowIso() } : { status: 'declined', declinedBy: 'admin', adminAt: nowIso() })
        .where(eq(parentLinks.id, link.id))
        .run();
    }, { behavior: 'immediate' });
    res.json({ ok: true });
  });

  return r;
}
