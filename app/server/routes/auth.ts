import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applications, users } from '../db/schema';
import { HttpError, endSession, hashPassword, requireUser, startSession, verifyPassword } from '../auth';
import { emailSchema, profileSchema, tutorDetailsSchema, type Ctx } from '../context';
import { meDto } from '../views';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from '../seed';
import { iso } from '../../shared/format';
import { uid } from '../services';

const signupSchema = z.object({
  role: z.enum(['student', 'teacher', 'parent']),
  name: z.string().trim().min(1, 'Fill in your name, email and password.').max(120),
  email: emailSchema,
  password: z.string().min(6, 'Use at least 6 characters for your password.').max(200),
  gradeLabel: z.string().trim().max(60).optional(),
  school: z.string().trim().max(120).optional(),
  childEmail: z.string().trim().toLowerCase().max(200).optional(),
  profile: profileSchema.optional(),
  tutor: tutorDetailsSchema.partial().optional(),
});

export function authRoutes(ctx: Ctx) {
  const { db, svc } = ctx;
  const r = Router();
  const byEmail = (email: string) => db.select().from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).get();

  r.get('/auth/me', (req, res) => {
    res.json({ me: req.user ? meDto(db, req.user) : null });
  });

  r.post('/auth/login', async (req, res) => {
    const body = z.object({ email: z.string(), password: z.string() }).parse(req.body);
    const u = byEmail(body.email);
    if (!u || !(await verifyPassword(body.password, u.passwordHash))) throw new HttpError(400, 'Email or password is incorrect.');
    if (u.status !== 'active') throw new HttpError(403, 'This account has been deactivated. Contact the Tutors To Go admin.');
    startSession(db, res, u.id);
    res.json({ me: meDto(db, u) });
  });

  r.post('/auth/logout', (req, res) => {
    endSession(db, req, res);
    res.json({ ok: true });
  });

  r.post('/auth/signup', async (req, res) => {
    const d = signupSchema.parse(req.body);
    if (byEmail(d.email)) throw new HttpError(409, 'An account with this email already exists.');
    if (d.role !== 'parent' && !d.profile) throw new HttpError(400, 'Complete your matching profile.');
    const id = uid(d.role[0] + '_');
    const passwordHash = await hashPassword(d.password);
    let linked = false;
    db.transaction((tx) => {
      const base = { id, role: d.role, name: d.name, email: d.email, passwordHash, status: 'active' as const, joined: iso(new Date()) };
      if (d.role === 'student') {
        tx.insert(users).values({ ...base, profile: d.profile, gradeLabel: d.gradeLabel ?? '', school: d.school ?? '' }).run();
      } else if (d.role === 'teacher') {
        const t = d.tutor ?? {};
        tx.insert(users)
          .values({
            ...base,
            profile: d.profile,
            headline: t.headline || `${d.profile!.subjects[0]} tutor`,
            rate: t.rate ?? 400,
            years: t.years ?? 1,
            education: t.education ?? '',
            curricula: t.curricula ?? [],
            method: t.method ?? "4A's lesson plan",
            bio: t.bio ?? '',
            slots: [],
          })
          .run();
        tx.insert(applications).values({ userId: id, status: 'draft' }).run();
      } else {
        const child = d.childEmail
          ? tx.select().from(users).where(and(eq(users.role, 'student'), sql`lower(${users.email}) = ${d.childEmail}`)).get()
          : undefined;
        tx.insert(users).values({ ...base, childId: child?.id ?? null }).run();
        if (child) {
          tx.update(users).set({ parentId: id }).where(eq(users.id, child.id)).run();
          linked = true;
        }
      }
    });
    const u = db.select().from(users).where(eq(users.id, id)).get()!;
    startSession(db, res, id);
    svc.bump();
    const m = d.role === 'student' ? svc.matches(id) : null;
    res.status(201).json({
      me: meDto(db, u),
      linked,
      cluster: m ? { no: m.cluster + 1, count: m.inCluster.length } : null,
    });
  });

  // Demo helpers: only available when the server runs in demo mode.
  r.get('/demo', (_req, res) => {
    res.json(ctx.demo ? { enabled: true, password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS } : { enabled: false });
  });

  r.post('/demo/reset', async (req, res) => {
    if (!ctx.demo) throw new HttpError(404, 'Not found.');
    await seedDemo(db);
    svc.bump();
    endSession(db, req, res);
    res.json({ ok: true });
  });

  /** The floating match card on the landing page: the demo student's top match. */
  r.get('/demo/preview', (_req, res) => {
    const bea = ctx.demo ? db.select({ id: users.id }).from(users).where(eq(users.id, 's_bea')).get() : undefined;
    const m = bea ? svc.matches(bea.id) : null;
    const top = m?.inCluster[0];
    if (!m || !top) return void res.json({ preview: null });
    const t = svc.pool().find((p) => p.id === top.id)!;
    res.json({
      preview: {
        student: 'Bea Santos',
        tutor: top.name,
        pct: top.pct,
        shared: top.sharedHobbies,
        cluster: `Cluster ${m.cluster + 1} · ${m.info.name}`,
        subjects: t.profile.subjects.join(' & '),
      },
    });
  });

  // Signed-in user's own settings
  r.put('/me/profile', (req, res) => {
    const me = requireUser(req, 'student', 'teacher');
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        gradeLabel: z.string().trim().max(60).optional(),
        school: z.string().trim().max(120).optional(),
        profile: profileSchema,
        tutor: tutorDetailsSchema.optional(),
      })
      .parse(req.body);
    const patch: Partial<typeof users.$inferInsert> = { name: body.name, profile: body.profile };
    if (me.role === 'student') Object.assign(patch, { gradeLabel: body.gradeLabel ?? '', school: body.school ?? '' });
    if (me.role === 'teacher') {
      if (!body.tutor) throw new HttpError(400, 'Fill in your teaching details.');
      Object.assign(patch, body.tutor);
    }
    db.update(users).set(patch).where(eq(users.id, me.id)).run();
    svc.bump();
    const u = db.select().from(users).where(eq(users.id, me.id)).get()!;
    const m = me.role === 'student' ? svc.matches(me.id) : null;
    res.json({ me: meDto(db, u), cluster: m ? { no: m.cluster + 1, count: m.inCluster.length } : null });
  });

  return r;
}
