import { Router } from 'express';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { applications, groupInvites, groupMembers, reviews, tutoringSessions, users } from '../db/schema';
import { HttpError, requireUser, type User } from '../auth';
import { saveFile, type Ctx } from '../context';
import { childIdsOf, nowIso, uid } from '../services';
import { reviewViews, sessionViews } from '../views';
import { iso, slotDate, sortSlots } from '../../shared/format';
import { SESSION_HOURS, SESSION_MODES } from '../../shared/vocab';
import type { ScoredTutor } from '../../shared/matching';

const hoursSchema = z.number().refine((h) => (SESSION_HOURS as readonly number[]).includes(h), 'Choose a duration.');
type Booking = Pick<typeof tutoringSessions.$inferSelect, 'studentId' | 'tutorId' | 'date' | 'slot' | 'hours'>;
const startMinute = (slot: string) => {
  const [h, m] = slot.split(' ')[1].split(':').map(Number);
  return h * 60 + m;
};
const overlaps = (a: Booking, b: Booking) => {
  const startA = startMinute(a.slot);
  const startB = startMinute(b.slot);
  return a.date === b.date && startA < startB + b.hours * 60 && startB < startA + a.hours * 60;
};

export function sessionRoutes(ctx: Ctx) {
  const { db, svc } = ctx;
  const r = Router();

  function approvedTutor(id: string) {
    const row = db
      .select({ user: users, status: applications.status })
      .from(users)
      .innerJoin(applications, eq(applications.userId, users.id))
      .where(and(eq(users.id, id), eq(users.role, 'teacher')))
      .get();
    return row && row.status === 'approved' && row.user.status === 'active' ? row.user : null;
  }

  /** Tutor card data for match lists, combining the match score with rating stats. */
  function tutorCards(list: ScoredTutor[]) {
    if (!list.length) return [];
    const rows = db.select().from(users).where(inArray(users.id, list.map((m) => m.id))).all();
    const byId = new Map(rows.map((u) => [u.id, u]));
    const stats = svc.allTutorStats();
    return list.map((m) => {
      const t = byId.get(m.id)!;
      const s = stats.get(m.id);
      return {
        id: m.id,
        name: t.name,
        headline: t.headline ?? '',
        subjects: t.profile!.subjects,
        levels: t.profile!.grades,
        rate: t.rate ?? 0,
        years: t.years ?? 0,
        avg: s?.avg ?? 0,
        count: s?.count ?? 0,
        pct: m.pct,
        d: m.d,
        cluster: m.cluster,
        sharedHobbies: m.sharedHobbies,
        why: m.why,
        blocks: m.blocks.map((b) => ({ label: b.label, sim: b.sim })),
      };
    });
  }

  function reservations(tutorId: string, studentId: string, exceptId: string) {
    return db.select().from(tutoringSessions).where(and(
      or(eq(tutoringSessions.tutorId, tutorId), eq(tutoringSessions.studentId, studentId)),
      inArray(tutoringSessions.status, ['accepted', 'completed']),
      exceptId ? ne(tutoringSessions.id, exceptId) : undefined,
    )).all();
  }

  function conflict(candidate: Booking, existing: Booking[]) {
    const taken = existing.filter((s) => overlaps(candidate, s));
    if (taken.some((s) => s.tutorId === candidate.tutorId)) return 'Cannot confirm this request: you already have another session during that time.';
    if (taken.some((s) => s.studentId === candidate.studentId)) return 'Cannot confirm this request: this student already has another session during that time.';
    return null;
  }

  /**
   * The tutor's open hours over the next seven days, soonest first. A slot is
   * `taken` when a session of `hours` there would overlap one the tutor has
   * already confirmed.
   */
  function scheduledSlots(t: User, hours = 1) {
    const booked = db.select().from(tutoringSessions)
      .where(and(eq(tutoringSessions.tutorId, t.id), inArray(tutoringSessions.status, ['accepted', 'completed'])))
      .all();
    return (t.slots ?? [])
      .map((slot) => ({ at: slotDate(slot), slot }))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map(({ at, slot }) => {
        const date = iso(at);
        return { date, slot, taken: booked.some((s) => overlaps({ tutorId: t.id, studentId: '', date, slot, hours }, s)) };
      });
  }

  r.get('/student/home', (req, res) => {
    const me = requireUser(req, 'student');
    const mine = db.select().from(tutoringSessions).where(eq(tutoringSessions.studentId, me.id)).all();
    const up = mine.filter((x) => x.status === 'accepted').sort((a, b) => (a.date < b.date ? -1 : 1));
    const done = mine.filter((x) => x.status === 'completed');
    const groupCount = db.select({ g: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, me.id)).all().length;
    const invites = db.select({ g: groupInvites.groupId }).from(groupInvites).where(eq(groupInvites.userId, me.id)).all().length;
    const m = svc.matches(me.id);
    res.json({
      next: up[0] ? sessionViews(db, [up[0]])[0] : null,
      moreUp: Math.max(0, up.length - 1),
      cluster: m ? { no: m.cluster + 1, name: m.info.name, count: m.inCluster.length } : null,
      stats: {
        completed: done.length,
        hours: done.reduce((s, x) => s + x.hours, 0),
        pending: mine.filter((x) => x.status === 'pending').length,
        groups: groupCount,
        invites,
      },
      top: m ? tutorCards(m.inCluster.slice(0, 3)) : [],
      toRate: sessionViews(db, done.filter((x) => !x.rated)),
    });
  });

  r.get('/matches', (req, res) => {
    const me = requireUser(req, 'student');
    const m = svc.matches(me.id);
    if (!m) return void res.json({ matches: null, reason: svc.pool().some((p) => p.role === 'teacher') ? 'profile_required' : 'no_tutors' });
    res.json({
      matches: {
        cluster: { no: m.cluster + 1, name: m.info.name, count: m.inCluster.length },
        settings: svc.getSettings(),
        inCluster: tutorCards(m.inCluster),
        others: tutorCards(m.others.slice(0, 5)),
      },
    });
  });

  r.get('/tutors/:id', (req, res) => {
    const me = requireUser(req);
    const t = approvedTutor(req.params.id);
    if (!t) throw new HttpError(404, 'This tutor isn’t available.');
    const stats = svc.tutorStats(t.id);
    const visible = db
      .select()
      .from(reviews)
      .where(and(eq(reviews.tutorId, t.id), eq(reviews.hidden, false)))
      .all()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    let match = null;
    if (me.role === 'student') {
      const m = svc.matches(me.id);
      const x = m && [...m.inCluster, ...m.others].find((s) => s.id === t.id);
      if (m && x)
        match = {
          pct: x.pct,
          cluster: x.cluster + 1,
          yourCluster: x.cluster === m.cluster,
          why: x.why,
          blocks: x.blocks.map((b) => ({ label: b.label, sim: b.sim })),
          sharedHobbies: x.sharedHobbies,
        };
    }
    res.json({
      tutor: {
        id: t.id,
        name: t.name,
        headline: t.headline ?? '',
        bio: t.bio ?? '',
        rate: t.rate ?? 0,
        years: t.years ?? 0,
        education: t.education ?? '',
        curricula: t.curricula ?? [],
        method: t.method ?? '',
        profile: t.profile!,
        slots: sortSlots(t.slots ?? []),
      },
      stats,
      reviews: reviewViews(db, visible, me.role === 'admin'),
      match,
    });
  });

  r.get('/tutors/:id/booking', (req, res) => {
    const me = requireUser(req, 'student');
    const hours = hoursSchema.parse(req.query.hours === undefined ? 1 : z.coerce.number().parse(req.query.hours));
    const t = approvedTutor(req.params.id);
    if (!t) throw new HttpError(404, 'This tutor isn’t available.');
    const mySubjects = me.profile?.subjects ?? [];
    const subjects = t.profile!.subjects.slice().sort((a, b) => Number(mySubjects.includes(b)) - Number(mySubjects.includes(a)));
    res.json({
      tutor: { id: t.id, name: t.name, rate: t.rate ?? 0 },
      subjects,
      slots: scheduledSlots(t, hours),
      learner: me.name + (me.gradeLabel ? `, ${me.gradeLabel}` : ''),
    });
  });

  r.post('/sessions', (req, res) => {
    const me = requireUser(req, 'student');
    const d = z
      .object({
        tutorId: z.string(),
        subject: z.string(),
        date: z.string(),
        slot: z.string(),
        hours: hoursSchema,
        mode: z.string().refine((m) => (SESSION_MODES as readonly string[]).includes(m), 'Choose a mode.'),
        topic: z.string().trim().min(5, 'Tell the tutor what you want to work on.').max(1000),
        learner: z.string().trim().max(160).default(''),
        guardian: z.string().trim().max(160).default(''),
      })
      .parse(req.body);
    // Requests may overlap each other; the tutor reserves the interval when accepting.
    const id = db.transaction((tx) => {
      const t = approvedTutor(d.tutorId);
      if (!t) throw new HttpError(404, 'This tutor isn’t available.');
      if (!t.profile!.subjects.includes(d.subject)) throw new HttpError(400, `${t.name} doesn’t teach ${d.subject}.`);
      const open = scheduledSlots(t, d.hours).find((o) => o.date === d.date && o.slot === d.slot);
      if (!open) throw new HttpError(409, 'That slot is no longer on the tutor’s schedule. Choose another one.');
      if (open.taken) throw new HttpError(409, `${t.name} is already booked then. Choose another slot.`);
      const id = uid('ses_');
      tx.insert(tutoringSessions)
        .values({ id, studentId: me.id, tutorId: t.id, subject: d.subject, date: d.date, slot: d.slot, hours: d.hours, mode: d.mode, topic: d.topic, learner: d.learner, guardian: d.guardian, status: 'pending', amount: (t.rate ?? 0) * d.hours, createdAt: nowIso() })
        .run();
      return id;
    }, { behavior: 'immediate' });
    res.status(201).json({ id });
  });

  /** Sessions for the signed-in user: their own as student or tutor, or their linked children's for parents. */
  r.get('/sessions', (req, res) => {
    const me = requireUser(req, 'student', 'teacher', 'parent');
    const who =
      me.role === 'student'
        ? eq(tutoringSessions.studentId, me.id)
        : me.role === 'teacher'
          ? eq(tutoringSessions.tutorId, me.id)
          : inArray(tutoringSessions.studentId, childIdsOf(db, me.id));
    const rows = db.select().from(tutoringSessions).where(who).all().sort((a, b) => (a.date < b.date ? -1 : 1));
    res.json({ sessions: sessionViews(db, rows) });
  });

  function ownSession(me: User, id: string, as: 'studentId' | 'tutorId') {
    const s = db.select().from(tutoringSessions).where(eq(tutoringSessions.id, id)).get();
    if (!s || s[as] !== me.id) throw new HttpError(404, 'Session not found.');
    return s;
  }

  r.post('/sessions/:id/respond', (req, res) => {
    const me = requireUser(req, 'teacher');
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    // Lock before checking conflicts so simultaneous confirmations cannot both succeed.
    const autoDeclined = db.transaction((tx) => {
      const s = ownSession(me, req.params.id, 'tutorId');
      if (s.status !== 'pending') throw new HttpError(409, 'This request was already answered.');
      if (accept) {
        const message = conflict(s, reservations(s.tutorId, s.studentId, s.id));
        if (message) throw new HttpError(409, message);
      }
      tx.update(tutoringSessions).set({ status: accept ? 'accepted' : 'declined' }).where(eq(tutoringSessions.id, s.id)).run();
      if (!accept) return 0;
      // A tutor teaches one class at a time, so other requests for the same time are declined.
      const clashing = tx.select().from(tutoringSessions)
        .where(and(eq(tutoringSessions.tutorId, s.tutorId), eq(tutoringSessions.status, 'pending'), ne(tutoringSessions.id, s.id)))
        .all()
        .filter((p) => overlaps(s, p))
        .map((p) => p.id);
      if (clashing.length) {
        tx.update(tutoringSessions)
          .set({ status: 'declined', declineReason: 'The tutor is already booked at this time.' })
          .where(inArray(tutoringSessions.id, clashing))
          .run();
      }
      return clashing.length;
    }, { behavior: 'immediate' });
    res.json({ ok: true, autoDeclined });
  });

  r.post('/sessions/:id/complete', (req, res) => {
    const me = requireUser(req, 'teacher');
    const s = ownSession(me, req.params.id, 'tutorId');
    if (s.status !== 'accepted') throw new HttpError(409, 'Only accepted sessions can be completed.');
    db.update(tutoringSessions).set({ status: 'completed' }).where(eq(tutoringSessions.id, s.id)).run();
    res.json({ ok: true });
  });

  r.post('/sessions/:id/receipt', ctx.upload.single('receipt'), (req, res) => {
    const me = requireUser(req, 'student');
    const s = ownSession(me, String(req.params.id), 'studentId');
    if (!['accepted', 'completed'].includes(s.status)) throw new HttpError(409, 'You can pay once the tutor accepts.');
    if (!['unpaid', 'rejected'].includes(s.paymentStatus)) throw new HttpError(409, 'A receipt for this session is already in.');
    if (!req.file) throw new HttpError(400, 'Attach your receipt.');
    const body = z
      .object({
        reference: z.string().trim().max(40, 'Keep the reference number under 40 characters.').default(''),
        amount: z.coerce.number().positive('Enter the amount you paid.'),
      })
      .parse(req.body);
    const fileId = saveFile(db, me.id, req.file);
    db.update(tutoringSessions)
      .set({ paymentStatus: 'for_review', paymentRef: body.reference || null, receiptFileId: fileId, receiptName: req.file.originalname, amountPaid: body.amount, receiptAt: nowIso(), reviewedAt: null })
      .where(eq(tutoringSessions.id, s.id))
      .run();
    res.json({ ok: true });
  });

  r.post('/reviews', (req, res) => {
    const me = requireUser(req, 'student', 'parent');
    const d = z
      .object({
        tutorId: z.string(),
        rating: z.number().int().min(1, 'Choose a star rating.').max(5),
        comment: z.string().trim().min(4, 'Add a short comment.').max(2000),
        anonymous: z.boolean(),
        sessionId: z.string().optional(),
      })
      .parse(req.body);
    const learnerIds = me.role === 'student' ? [me.id] : childIdsOf(db, me.id);
    if (!learnerIds.length) throw new HttpError(403, 'Link your account to your child first.');
    // Lock before reading review history so concurrent submissions share the same limit.
    db.transaction((tx) => {
      const theirs = tx
        .select()
        .from(tutoringSessions)
        .where(and(inArray(tutoringSessions.studentId, learnerIds), eq(tutoringSessions.tutorId, d.tutorId)))
        .all();
      if (me.role === 'student' && !d.sessionId) throw new HttpError(400, 'Choose a completed session to review.');
      let session = null;
      if (d.sessionId) {
        session = theirs.find((x) => x.id === d.sessionId);
        if (!session || session.status !== 'completed') throw new HttpError(400, 'You can rate a session once it’s completed.');
        if (me.role === 'student' && session.rated) throw new HttpError(409, 'You already rated this session.');
      }
      if (!theirs.some((x) => x.status === 'completed')) throw new HttpError(403, 'You can review this tutor after a completed session.');
      const previous = tx.select({ id: reviews.id }).from(reviews).where(and(
        eq(reviews.authorId, me.id), eq(reviews.tutorId, d.tutorId),
        me.role === 'student' ? eq(reviews.sessionId, d.sessionId!) : undefined,
      )).get();
      if (previous) throw new HttpError(409, me.role === 'parent' ? 'You already reviewed this tutor.' : 'You already rated this session.');
      tx.insert(reviews)
        .values({ id: uid('r_'), tutorId: d.tutorId, authorId: me.id, authorRole: me.role as 'student' | 'parent', rating: d.rating, comment: d.comment, anonymous: d.anonymous, date: iso(new Date()), status: 'new', sessionId: session?.id ?? null })
        .run();
      if (session && me.role === 'student') tx.update(tutoringSessions).set({ rated: d.rating }).where(eq(tutoringSessions.id, session.id)).run();
    }, { behavior: 'immediate' });
    res.status(201).json({ ok: true });
  });

  r.get('/parent/progress', (req, res) => {
    const me = requireUser(req, 'parent');
    const ids = childIdsOf(db, me.id);
    const children = ids.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)).all() : [];
    const wanted = typeof req.query.child === 'string' ? req.query.child : children[0]?.id;
    if (!wanted) return void res.json({ children, child: null });
    if (!ids.includes(wanted)) throw new HttpError(404, 'You aren’t linked to this student.');
    const child = db.select().from(users).where(eq(users.id, wanted)).get()!;
    const rows = db.select().from(tutoringSessions).where(eq(tutoringSessions.studentId, child.id)).all().sort((a, b) => (a.date < b.date ? 1 : -1));
    const done = rows.filter((x) => x.status === 'completed');
    const tutorIds = [...new Set(rows.filter((x) => x.status !== 'declined').map((x) => x.tutorId))];
    const tutorRows = tutorIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, tutorIds)).all() : [];
    const mine = db.select().from(reviews).where(eq(reviews.authorId, me.id)).all().sort((a, b) => (a.date < b.date ? 1 : -1));
    res.json({
      children,
      child: { id: child.id, name: child.name, gradeLabel: child.gradeLabel, school: child.school },
      stats: {
        completed: done.length,
        hours: done.reduce((s, x) => s + x.hours, 0),
        upcoming: rows.filter((x) => x.status === 'accepted').length,
        tutors: tutorIds.length,
      },
      sessions: sessionViews(db, rows),
      tutors: tutorRows.map((t) => ({
        id: t.id,
        name: t.name,
        completed: done.filter((x) => x.tutorId === t.id).length,
        rated: mine.find((x) => x.tutorId === t.id)?.rating ?? null,
      })),
      feedback: reviewViews(db, mine, true),
    });
  });

  return r;
}
