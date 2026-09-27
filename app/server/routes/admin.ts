import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applicationDocs, applicationHistory, applications, authSessions, reviews, settings, tutoringSessions, users } from '../db/schema';
import { HttpError, hashPassword, requireUser } from '../auth';
import { emailSchema, profileSchema, tutorDetailsSchema, type Ctx } from '../context';
import { nowIso, uid } from '../services';
import { nameMap, reviewViews } from '../views';
import { iso } from '../../shared/format';
import { DOC_KINDS } from '../../shared/vocab';
import type { AppStatus } from '../../shared/types';

export function adminRoutes(ctx: Ctx) {
  const { db, svc } = ctx;
  const r = Router();
  r.use('/admin', (req, _res, next) => {
    requireUser(req, 'admin');
    next();
  });

  const needsAttention = (x: { status: string; rating: number }) => x.status === 'new' && x.rating <= 3;

  r.get('/admin/overview', (_req, res) => {
    const tutors = db.select({ id: users.id, name: users.name, profile: users.profile, status: applications.status }).from(users).innerJoin(applications, eq(applications.userId, users.id)).all();
    const pendingApps = tutors.filter((t) => t.status === 'pending');
    const forReview = db.select().from(tutoringSessions).where(eq(tutoringSessions.paymentStatus, 'for_review')).all();
    const flagged = db.select().from(reviews).all().filter(needsAttention);
    const people = db.select({ status: users.status, role: users.role }).from(users).where(ne(users.role, 'admin')).all();
    const who = nameMap(db, [...forReview.map((x) => x.studentId), ...flagged.map((x) => x.tutorId)]);
    const cl = svc.clusterNow();
    res.json({
      counts: {
        applications: pendingApps.length,
        payments: forReview.length,
        feedback: flagged.length,
        active: people.filter((p) => p.status === 'active').length,
        deactivated: people.filter((p) => p.status !== 'active').length,
      },
      queue: {
        apps: pendingApps.slice(0, 4).map((t) => ({ id: t.id, name: t.name, subjects: t.profile?.subjects ?? [] })),
        payments: forReview.slice(0, 4).map((x) => ({ id: x.id, student: who(x.studentId).name, amount: x.amount, file: x.receiptName })),
        feedback: flagged.slice(0, 4).map((x) => ({ id: x.id, tutor: who(x.tutorId).name, rating: x.rating, comment: x.comment })),
      },
      model: { k: cl.km.centroids.length, approach: cl.settings.approach, nS: cl.nS, nT: cl.nT, iterations: cl.km.iterations },
    });
  });

  // Applications
  r.get('/admin/applications', (_req, res) => {
    const rows = db.select({ user: users, app: applications }).from(users).innerJoin(applications, eq(applications.userId, users.id)).all();
    const docs = db.select({ userId: applicationDocs.userId }).from(applicationDocs).all();
    res.json({
      applications: rows
        .map(({ user: u, app: a }) => ({
          id: u.id,
          name: u.name,
          subjects: u.profile?.subjects ?? [],
          status: a.status,
          submittedAt: a.submittedAt,
          docCount: docs.filter((d) => d.userId === u.id).length + (a.video ? 1 : 0),
        }))
        .sort((a, b) => ((b.submittedAt ?? '') > (a.submittedAt ?? '') ? 1 : -1)),
    });
  });

  r.get('/admin/applications/:id', (req, res) => {
    const row = db.select({ user: users, app: applications }).from(users).innerJoin(applications, eq(applications.userId, users.id)).where(eq(users.id, req.params.id)).get();
    if (!row) throw new HttpError(404, 'Application not found.');
    const { user: u, app: a } = row;
    const docs = db.select().from(applicationDocs).where(eq(applicationDocs.userId, u.id)).all();
    const history = db.select().from(applicationHistory).where(eq(applicationHistory.userId, u.id)).all();
    res.json({
      application: {
        id: u.id,
        name: u.name,
        email: u.email,
        education: u.education ?? '',
        profile: u.profile,
        curricula: u.curricula ?? [],
        method: u.method ?? '',
        rate: u.rate ?? 0,
        status: a.status,
        note: a.note,
        video: a.video ?? '',
        docs: DOC_KINDS.map((d) => {
          const f = docs.find((x) => x.kind === d.key);
          return { kind: d.key, label: d.label, fileName: f?.fileName ?? null, fileId: f?.fileId ?? null };
        }),
        history: history.map((h) => ({ status: h.status, at: h.at, note: h.note })).reverse(),
      },
    });
  });

  r.post('/admin/applications/:id/status', (req, res) => {
    const { status, note } = z
      .object({ status: z.enum(['pending', 'needs_changes', 'approved', 'rejected']), note: z.string().trim().max(1000).default('') })
      .parse(req.body);
    if ((status === 'needs_changes' || status === 'rejected') && !note) throw new HttpError(400, 'Add a note so the applicant knows what to fix.');
    const app = db.select().from(applications).where(eq(applications.userId, req.params.id)).get();
    if (!app) throw new HttpError(404, 'Application not found.');
    db.transaction((tx) => {
      tx.update(applications).set({ status: status as AppStatus, note }).where(eq(applications.userId, app.userId)).run();
      tx.insert(applicationHistory).values({ userId: app.userId, status, at: nowIso(), note }).run();
    });
    res.json({ ok: true });
  });

  // Tutor store
  r.get('/admin/tutors', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const rows = db
      .select({ user: users })
      .from(users)
      .innerJoin(applications, eq(applications.userId, users.id))
      .where(eq(applications.status, 'approved'))
      .all()
      .map((x) => x.user)
      .filter((u) => !q || `${u.name} ${u.email} ${(u.profile?.subjects ?? []).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const stats = svc.allTutorStats();
    res.json({
      tutors: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        profile: u.profile,
        headline: u.headline ?? '',
        bio: u.bio ?? '',
        rate: u.rate ?? 0,
        years: u.years ?? 0,
        education: u.education ?? '',
        curricula: u.curricula ?? [],
        method: u.method ?? '',
        avg: stats.get(u.id)?.avg ?? 0,
        count: stats.get(u.id)?.count ?? 0,
      })),
    });
  });

  const tutorBody = z.object({ name: z.string().trim().min(1, 'Enter a name and a valid email.').max(120), email: emailSchema, profile: profileSchema, tutor: tutorDetailsSchema });

  function emailTaken(email: string, exceptId?: string) {
    const u = db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).get();
    return !!u && u.id !== exceptId;
  }

  r.post('/admin/tutors', async (req, res) => {
    const d = tutorBody.parse(req.body);
    if (!d.tutor.curricula.length) throw new HttpError(400, 'Pick at least one curriculum the tutor is familiar with.');
    if (emailTaken(d.email)) throw new HttpError(409, 'Another account uses this email.');
    const id = uid('t_');
    // New tutors get a one-time temporary password the admin shares with them.
    const tempPassword = randomBytes(6).toString('base64url');
    const passwordHash = await hashPassword(tempPassword);
    db.transaction((tx) => {
      tx.insert(users).values({ id, role: 'teacher', name: d.name, email: d.email, passwordHash, status: 'active', joined: iso(new Date()), profile: d.profile, ...d.tutor, slots: ['Sat 09:00', 'Sat 10:00'] }).run();
      tx.insert(applications).values({ userId: id, status: 'approved', submittedAt: iso(new Date()), note: 'Added by admin' }).run();
      tx.insert(applicationHistory).values({ userId: id, status: 'approved', at: nowIso(), note: 'Added to the tutor store by admin.' }).run();
    });
    res.status(201).json({ id, tempPassword });
  });

  r.put('/admin/tutors/:id', (req, res) => {
    const d = tutorBody.parse(req.body);
    const u = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.role, 'teacher'))).get();
    if (!u) throw new HttpError(404, 'Tutor not found.');
    if (!d.tutor.curricula.length) throw new HttpError(400, 'Pick at least one curriculum the tutor is familiar with.');
    if (emailTaken(d.email, u.id)) throw new HttpError(409, 'Another account uses this email.');
    db.update(users).set({ name: d.name, email: d.email, profile: d.profile, ...d.tutor }).where(eq(users.id, u.id)).run();
    res.json({ ok: true });
  });

  r.delete('/admin/tutors/:id', (req, res) => {
    const u = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.role, 'teacher'))).get();
    if (!u) throw new HttpError(404, 'Tutor not found.');
    // Reviews, sessions, application records and logins cascade with the user.
    db.delete(users).where(eq(users.id, u.id)).run();
    res.json({ ok: true });
  });

  // Accounts
  r.get('/admin/users', (req, res) => {
    const role = String(req.query.role ?? 'all');
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const list = db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, joined: users.joined, status: users.status })
      .from(users)
      .where(ne(users.role, 'admin'))
      .all()
      .filter((u) => (role === 'all' || u.role === role) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ total: list.length, users: list.slice(0, 80) });
  });

  r.post('/admin/users/:id/status', (req, res) => {
    const { status } = z.object({ status: z.enum(['active', 'deactivated']) }).parse(req.body);
    const u = db.select().from(users).where(eq(users.id, req.params.id)).get();
    if (!u || u.role === 'admin') throw new HttpError(404, 'Account not found.');
    db.transaction((tx) => {
      tx.update(users).set({ status }).where(eq(users.id, u.id)).run();
      if (status === 'deactivated') tx.delete(authSessions).where(eq(authSessions.userId, u.id)).run();
    });
    res.json({ ok: true });
  });

  // Payments
  r.get('/admin/payments', (_req, res) => {
    const rows = db.select().from(tutoringSessions).where(ne(tutoringSessions.paymentStatus, 'unpaid')).all().sort((a, b) => ((a.receiptAt ?? '') < (b.receiptAt ?? '') ? 1 : -1));
    const who = nameMap(db, rows.flatMap((x) => [x.studentId, x.tutorId]));
    res.json({
      payments: rows.map((x) => ({
        id: x.id,
        student: who(x.studentId).name,
        tutor: who(x.tutorId).name,
        subject: x.subject,
        date: x.date,
        amount: x.amount,
        amountPaid: x.amountPaid,
        txn: x.paymentTxn,
        receiptName: x.receiptName,
        receiptFileId: x.receiptFileId,
        at: x.receiptAt,
        status: x.paymentStatus,
      })),
    });
  });

  r.post('/admin/payments/:id', (req, res) => {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    const s = db.select().from(tutoringSessions).where(eq(tutoringSessions.id, req.params.id)).get();
    if (!s || s.paymentStatus !== 'for_review') throw new HttpError(409, 'This receipt isn’t waiting for review.');
    db.update(tutoringSessions).set({ paymentStatus: approve ? 'paid' : 'rejected', reviewedAt: nowIso() }).where(eq(tutoringSessions.id, s.id)).run();
    res.json({ ok: true, tutor: nameMap(db, [s.tutorId])(s.tutorId).name });
  });

  // Feedback moderation (admins see who wrote anonymous reviews)
  r.get('/admin/reviews', (_req, res) => {
    const all = db.select().from(reviews).all().sort((a, b) => (a.date < b.date ? 1 : -1));
    res.json({
      reviews: reviewViews(db, all, true).map((v, i) => ({ ...v, attention: needsAttention(all[i]) })),
    });
  });

  r.post('/admin/reviews/:id/action', (req, res) => {
    const { action } = z.object({ action: z.enum(['reviewed', 'hide', 'warn']) }).parse(req.body);
    const rv = db.select().from(reviews).where(eq(reviews.id, req.params.id)).get();
    if (!rv) throw new HttpError(404, 'Review not found.');
    const patch =
      action === 'reviewed'
        ? { status: 'reviewed' as const }
        : action === 'hide'
          ? { hidden: !rv.hidden, status: 'action' as const, note: rv.hidden ? 'Restored' : 'Hidden from profile' }
          : { status: 'action' as const, note: 'Tutor warned' };
    db.update(reviews).set(patch).where(eq(reviews.id, rv.id)).run();
    res.json({ ok: true, hidden: 'hidden' in patch ? patch.hidden : rv.hidden });
  });

  // Live matching model
  r.put('/admin/settings', (req, res) => {
    const s = z
      .object({ k: z.number().int().min(2).max(8), seed: z.number().int().min(1).max(1_000_000), init: z.enum(['kmeans++', 'random']), approach: z.enum(['joint', 'tutor']) })
      .parse(req.body);
    db.insert(settings).values({ id: 1, ...s }).onConflictDoUpdate({ target: settings.id, set: s }).run();
    res.json({ settings: s });
  });

  return r;
}
