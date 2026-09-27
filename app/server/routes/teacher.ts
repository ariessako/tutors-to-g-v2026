import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { applicationDocs, applicationHistory, applications, reviews, tutoringSessions, users } from '../db/schema';
import { HttpError, requireUser } from '../auth';
import { saveFile, type Ctx } from '../context';
import { nowIso } from '../services';
import { reviewViews, sessionViews } from '../views';
import { addDays, iso } from '../../shared/format';
import { DOC_KINDS, SCHEDULE_HOURS, WEEK } from '../../shared/vocab';

const VALID_SLOTS = new Set(WEEK.flatMap((d) => SCHEDULE_HOURS.map((h) => `${d} ${h}`)));

export function teacherRoutes(ctx: Ctx) {
  const { db, svc } = ctx;
  const r = Router();

  r.get('/teacher/dashboard', (req, res) => {
    const me = requireUser(req, 'teacher');
    const mine = db.select().from(tutoringSessions).where(eq(tutoringSessions.tutorId, me.id)).all();
    const up = mine.filter((x) => x.status === 'accepted').sort((a, b) => (a.date < b.date ? -1 : 1));
    const stats = svc.tutorStats(me.id);
    const today = new Date();
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const end = addDays(today, -i * 7);
      const start = addDays(end, -6);
      const [a, b] = [iso(start), iso(end)];
      const xs = mine.filter((x) => x.paymentStatus === 'paid' && x.date >= a && x.date <= b);
      weeks.push({
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: xs.reduce((s, x) => s + x.amount, 0),
        count: xs.length,
      });
    }
    const recent = db.select().from(reviews).where(eq(reviews.tutorId, me.id)).all().filter((x) => !x.hidden).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
    res.json({
      stats: {
        requests: mine.filter((x) => x.status === 'pending').length,
        upcoming: up.length,
        upcomingPaid: up.filter((x) => x.paymentStatus === 'paid').length,
        avg: stats.avg,
        count: stats.count,
      },
      next: sessionViews(db, up.slice(0, 4)),
      weeks,
      recent: reviewViews(db, recent),
    });
  });

  r.get('/teacher/reviews', (req, res) => {
    const me = requireUser(req, 'teacher');
    const all = db.select().from(reviews).where(eq(reviews.tutorId, me.id)).all().sort((a, b) => (a.date < b.date ? 1 : -1));
    res.json({ stats: svc.tutorStats(me.id), reviews: reviewViews(db, all) });
  });

  r.put('/me/slots', (req, res) => {
    const me = requireUser(req, 'teacher');
    const { slots } = z.object({ slots: z.array(z.string().refine((s) => VALID_SLOTS.has(s), 'Invalid time slot.')).max(WEEK.length * SCHEDULE_HOURS.length) }).parse(req.body);
    db.update(users).set({ slots: [...new Set(slots)] }).where(eq(users.id, me.id)).run();
    res.json({ ok: true });
  });

  function applicationView(userId: string) {
    const app = db.select().from(applications).where(eq(applications.userId, userId)).get();
    if (!app) throw new HttpError(404, 'No application found.');
    const docs = db.select().from(applicationDocs).where(eq(applicationDocs.userId, userId)).all();
    const history = db.select().from(applicationHistory).where(eq(applicationHistory.userId, userId)).all();
    return {
      status: app.status,
      note: app.note,
      video: app.video ?? '',
      submittedAt: app.submittedAt,
      docs: Object.fromEntries(docs.map((d) => [d.kind, { fileName: d.fileName, fileId: d.fileId }])),
      history: history.map((h) => ({ status: h.status, at: h.at, note: h.note })).reverse(),
    };
  }

  r.get('/me/application', (req, res) => {
    const me = requireUser(req, 'teacher');
    res.json({ application: applicationView(me.id) });
  });

  r.post(
    '/me/application',
    ctx.upload.fields(DOC_KINDS.map((d) => ({ name: d.key, maxCount: 1 }))),
    (req, res) => {
      const me = requireUser(req, 'teacher');
      const app = db.select().from(applications).where(eq(applications.userId, me.id)).get();
      if (!app) throw new HttpError(404, 'No application found.');
      const { video } = z
        .object({ video: z.string().trim().regex(/^https?:\/\/\S+\.\S+/, 'Add a valid video demo link starting with https://') })
        .parse(req.body);
      const uploaded = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const existing = new Set(db.select({ kind: applicationDocs.kind }).from(applicationDocs).where(eq(applicationDocs.userId, me.id)).all().map((d) => d.kind));
      const missing = DOC_KINDS.filter((d) => !uploaded[d.key]?.[0] && !existing.has(d.key)).map((d) => d.label);
      if (missing.length) throw new HttpError(400, `Still missing: ${missing.join(', ')}.`);
      const approved = app.status === 'approved';
      const saved = DOC_KINDS.flatMap((d) => {
        const f = uploaded[d.key]?.[0];
        return f ? [{ kind: d.key, f, fileId: saveFile(db, me.id, f) }] : [];
      });
      db.transaction((tx) => {
        for (const { kind, f, fileId } of saved) {
          tx.insert(applicationDocs)
            .values({ userId: me.id, kind, fileName: f.originalname, fileId })
            .onConflictDoUpdate({ target: [applicationDocs.userId, applicationDocs.kind], set: { fileName: f.originalname, fileId } })
            .run();
        }
        if (approved) {
          tx.update(applications).set({ video }).where(eq(applications.userId, me.id)).run();
        } else {
          tx.update(applications).set({ video, status: 'pending', submittedAt: iso(new Date()) }).where(eq(applications.userId, me.id)).run();
          tx.insert(applicationHistory).values({ userId: me.id, status: 'pending', at: nowIso() }).run();
        }
      });
      svc.bump();
      res.json({ application: applicationView(me.id), resubmitted: !approved });
    },
  );

  return r;
}

