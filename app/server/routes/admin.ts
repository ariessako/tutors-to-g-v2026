import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applicationDocs, applicationHistory, applications, authSessions, parentLinks, payments, reviews, settings, tutoringSessions, users, warnings } from '../db/schema';
import { paymentState, receiptsFor, syncPaymentStatus } from '../payments';
import { HttpError, hashPassword, requireUser } from '../auth';
import { checkTutor, emailSchema, profileSchema, tutorDetailsSchema, type Ctx } from '../context';
import { logEvent, nowIso, uid } from '../services';
import { nameMap, reviewViews, sessionViews } from '../views';
import { iso } from '../../shared/format';
import { docKindsFor } from '../../shared/vocab';
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
    const forReview = db.select({ id: payments.id, file: payments.receiptName, amount: payments.amount, studentId: tutoringSessions.studentId })
      .from(payments).innerJoin(tutoringSessions, eq(tutoringSessions.id, payments.sessionId)).where(eq(payments.status, 'for_review')).all();
    const flagged = db.select().from(reviews).all().filter(needsAttention);
    const people = db.select({ status: users.status, role: users.role }).from(users).where(ne(users.role, 'admin')).all();
    const links = db.select({ id: parentLinks.id }).from(parentLinks).where(eq(parentLinks.status, 'pending_admin')).all();
    const sent = db.select({ removedAt: warnings.removedAt }).from(warnings).all();
    const who = nameMap(db, [...forReview.map((x) => x.studentId), ...flagged.map((x) => x.tutorId)]);
    const cl = svc.clusterNow();
    res.json({
      counts: {
        applications: pendingApps.length,
        payments: forReview.length,
        feedback: flagged.length,
        parentLinks: links.length,
        warningsSent: sent.length,
        warningsActive: sent.filter((w) => !w.removedAt).length,
        banned: people.filter((p) => p.status === 'banned').length,
        active: people.filter((p) => p.status === 'active').length,
        deactivated: people.filter((p) => p.status !== 'active').length,
      },
      queue: {
        apps: pendingApps.slice(0, 4).map((t) => ({ id: t.id, name: t.name, subjects: t.profile?.subjects ?? [] })),
        payments: forReview.slice(0, 4).map((x) => ({ id: x.id, student: who(x.studentId).name, amount: x.amount, file: x.file })),
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
        termsVersion: u.termsVersion,
        termsAcceptedAt: u.termsAcceptedAt,
        status: a.status,
        note: a.note,
        video: a.video ?? '',
        licenseType: u.licenseType ?? 'licensed',
        eligibility: u.eligibility,
        years: u.years ?? 0,
        docs: docKindsFor(u.licenseType).map((d) => {
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
    checkTutor(d.tutor);
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
    checkTutor(d.tutor);
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
    const counts = new Map<string, number>();
    for (const w of db.select({ userId: warnings.userId }).from(warnings).where(isNull(warnings.removedAt)).all()) counts.set(w.userId, (counts.get(w.userId) ?? 0) + 1);
    res.json({ total: list.length, users: list.slice(0, 80).map((u) => ({ ...u, warnings: counts.get(u.id) ?? 0 })) });
  });

  r.post('/admin/users/:id/status', (req, res) => {
    // Setting a banned account back to active lifts the ban; its warnings stay on record.
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
  /** Every receipt, newest first, with the session's totals so admins can check each installment. */
  r.get('/admin/payments', (_req, res) => {
    const rows = db.select({ p: payments, s: tutoringSessions }).from(payments).innerJoin(tutoringSessions, eq(tutoringSessions.id, payments.sessionId)).all()
      .sort((a, b) => (a.p.uploadedAt < b.p.uploadedAt ? 1 : -1));
    const who = nameMap(db, rows.flatMap((x) => [x.s.studentId, x.s.tutorId]));
    const states = new Map<string, ReturnType<typeof paymentState>>();
    const stateOf = (s: typeof tutoringSessions.$inferSelect) => {
      if (!states.has(s.id)) states.set(s.id, paymentState(s, receiptsFor(db, s.id)));
      return states.get(s.id)!;
    };
    res.json({
      payments: rows.map(({ p, s }) => {
        const st = stateOf(s);
        return {
          id: p.id,
          sessionId: s.id,
          student: who(s.studentId).name,
          tutor: who(s.tutorId).name,
          subject: s.subject,
          date: s.date,
          due: s.amount,
          paid: st.paid,
          balance: st.balance,
          part: p.part,
          planParts: s.planParts,
          dueDate: st.schedule[p.part - 1]?.dueDate ?? s.date,
          nextDue: st.nextDue,
          amount: p.amount,
          reference: p.reference,
          receiptName: p.receiptName,
          receiptFileId: p.receiptFileId,
          at: p.uploadedAt,
          reviewedAt: p.reviewedAt,
          status: p.status,
        };
      }),
    });
  });

  /** Approves or rejects one receipt; the session's payment status follows. */
  r.post('/admin/payments/:id', (req, res) => {
    const admin = requireUser(req, 'admin');
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    const out = db.transaction((tx) => {
      const p = tx.select().from(payments).where(eq(payments.id, req.params.id)).get();
      if (!p || p.status !== 'for_review') throw new HttpError(409, 'This receipt isn’t waiting for review.');
      tx.update(payments).set({ status: approve ? 'approved' : 'rejected', reviewedAt: nowIso(), reviewedBy: admin.id }).where(eq(payments.id, p.id)).run();
      const state = syncPaymentStatus(tx, p.sessionId)!;
      const s = tx.select().from(tutoringSessions).where(eq(tutoringSessions.id, p.sessionId)).get()!;
      const label = s.planParts > 1 ? `Installment ${p.part} · ₱${p.amount.toLocaleString('en-US')}` : `₱${p.amount.toLocaleString('en-US')}`;
      logEvent(tx, s.id, approve ? 'payment_approved' : 'payment_rejected', admin.id, approve && state.balance > 0 ? `${label} · ₱${state.balance.toLocaleString('en-US')} left` : label);
      return { state, tutorId: s.tutorId };
    }, { behavior: 'immediate' });
    res.json({ ok: true, status: out.state.status, balance: out.state.balance, tutor: nameMap(db, [out.tutorId])(out.tutorId).name });
  });

  // Session log
  const sessionFilter = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(['pending', 'accepted', 'declined', 'completed']).optional(),
  });
  function loggedSessions(query: unknown) {
    const f = sessionFilter.parse(query);
    const rows = db.select().from(tutoringSessions).all()
      .filter((s) => (!f.from || s.date >= f.from) && (!f.to || s.date <= f.to) && (!f.status || s.status === f.status))
      .sort((a, b) => (a.date + a.slot.split(' ')[1] < b.date + b.slot.split(' ')[1] ? 1 : -1));
    return sessionViews(db, rows);
  }

  r.get('/admin/sessions', (req, res) => {
    res.json({ sessions: loggedSessions(req.query) });
  });

  r.get('/admin/sessions.csv', (req, res) => {
    const cell = (v: unknown) => {
      const s = v == null ? '' : String(v);
      // Quote every cell; a leading formula character is neutralised so spreadsheets don't execute it.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const head = ['Date', 'Time', 'Booked hours', 'Actual hours', 'Student', 'Tutor', 'Subject', 'Mode', 'Status', 'Attendance', 'Topics covered', 'Notes', 'Amount', 'Payment', 'Completed at'];
    const lines = loggedSessions(req.query).map((s) =>
      [s.date, s.time, s.hours, s.log?.actualHours, s.learner, s.tutor, s.subject, s.mode, s.status, s.log?.attendance, s.log?.topics, s.log?.notes, s.amount, s.payment.status, s.log?.completedAt].map(cell).join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tutors-to-go-sessions.csv"');
    res.send([head.map(cell).join(','), ...lines].join('\r\n'));
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
