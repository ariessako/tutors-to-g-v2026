import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { eq, ne } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { hashPassword } from '../server/auth';
import { openDb } from '../server/db';
import { applications, reviews, tutoringSessions, users } from '../server/db/schema';
import type { SessionStatus } from '../shared/types';

let db: ReturnType<typeof openDb>;
let app: ReturnType<typeof createApp>['app'];
let dir: string;
let passwordHash: string;
const profile = { hobbies: ['Coding', 'Anime', 'Music'], learning: 'Visual', social: 0.3, approach: 0.8, subjects: ['Math'], sched: ['Weekends'], grades: ['Senior High'] };
const review = { tutorId: 't1', rating: 4, comment: 'Helpful explanations', anonymous: false };

beforeAll(async () => { passwordHash = await hashPassword('test123'); });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ttg-regression-'));
  db = openDb(join(dir, 'test.db'));
  for (const [id, role] of [['s1', 'student'], ['s2', 'student'], ['t1', 'teacher'], ['p1', 'parent'], ['admin', 'admin']] as const) {
    db.insert(users).values({ id, role, name: id, email: `${id}@example.test`, passwordHash, joined: '2026-01-01', profile, ...(id === 'p1' ? { childId: 's1' } : {}) }).run();
  }
  db.insert(applications).values({ userId: 't1', status: 'approved' }).run();
  app = createApp({ db, uploadsDir: join(dir, 'uploads'), demo: false }).app;
});
afterEach(() => {
  db.$client.close();
  if (dirname(resolve(dir)) !== resolve(tmpdir()) || !dir.includes('ttg-regression-')) throw new Error('Unexpected test directory');
  rmSync(dir, { recursive: true, force: true });
});
async function as(id: string, target = app) {
  const agent = request.agent(target);
  expect((await agent.post('/api/auth/login').send({ email: `${id}@example.test`, password: 'test123' })).status).toBe(200);
  return agent;
}
function session(id = 'lesson', status: SessionStatus = 'completed', studentId = 's1') {
  db.insert(tutoringSessions).values({ id, studentId, tutorId: 't1', status, date: '2026-01-01', slot: 'Thu 09:00', hours: 1, subject: 'Math', mode: 'In-person', topic: 'Algebra practice', amount: 400, createdAt: '2026-01-01T00:00:00Z' }).run();
}

describe('review limits', () => {
  it('requires a student to name their own completed session and rejects repeats', async () => {
    session();
    session('other-child', 'completed', 's2');
    session('pending', 'pending');
    const student = await as('s1');
    expect((await student.post('/api/reviews').send(review)).status).toBe(400);
    for (const sessionId of ['other-child', 'pending', 'missing']) {
      expect((await student.post('/api/reviews').send({ ...review, sessionId })).status).toBe(400);
    }
    expect((await student.post('/api/reviews').send({ ...review, sessionId: 'lesson' })).status).toBe(201);
    expect((await student.post('/api/reviews').send({ ...review, sessionId: 'lesson', anonymous: true })).status).toBe(409);
    expect((await student.post('/api/reviews').send(review)).status).toBe(400);
    session('second-lesson');
    expect((await student.post('/api/reviews').send({ ...review, sessionId: 'second-lesson' })).status).toBe(201);
    expect(db.select().from(reviews).all()).toHaveLength(2);
  });

  it.each(['pending', 'accepted', 'declined'] as const)('does not allow parent reviews for a %s lesson', async (status) => {
    session('lesson', status);
    const parent = await as('p1');
    expect((await parent.post('/api/reviews').send(review)).status).toBe(403);
    expect((await parent.post('/api/reviews').send({ ...review, sessionId: 'lesson' })).status).toBe(400);
    expect(db.select().from(reviews).all()).toHaveLength(0);
  });

  it('limits parents to one review per tutor, even with different session IDs or a hidden review', async () => {
    session();
    session('second-lesson');
    const parent = await as('p1');
    expect((await parent.post('/api/reviews').send({ ...review, sessionId: 'lesson' })).status).toBe(201);
    expect(db.select().from(tutoringSessions).where(eq(tutoringSessions.id, 'lesson')).get()!.rated).toBe(0);
    db.update(reviews).set({ hidden: true }).run();
    for (const body of [review, { ...review, sessionId: 'second-lesson' }]) {
      const result = await parent.post('/api/reviews').send(body);
      expect(result.status).toBe(409);
      expect(result.body.error).toBe('You already reviewed this tutor.');
    }
    const student = await as('s1');
    expect((await student.post('/api/reviews').send({ ...review, sessionId: 'lesson' })).status).toBe(201);
    expect((await parent.get('/api/parent/progress')).body.tutors[0].rated).toBe(4);
  });

  it.each(['s1', 'p1'])('allows only one simultaneous review by %s across database connections', async (id) => {
    session();
    const secondDb = openDb(join(dir, 'test.db'));
    try {
      const otherApp = createApp({ db: secondDb, uploadsDir: join(dir, 'uploads'), demo: false }).app;
      const first = await as(id);
      const second = await as(id, otherApp);
      const body = { ...review, ...(id === 's1' ? { sessionId: 'lesson' } : {}) };
      const responses = await Promise.all([first.post('/api/reviews').send(body), second.post('/api/reviews').send(body)]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(db.select().from(reviews).all()).toHaveLength(1);
    } finally { secondDb.$client.close(); }
  });
});

describe('empty matching pool', () => {
  it.each(['joint', 'tutor'] as const)('keeps a fresh %s installation and first student signup usable', async (approach) => {
    db.delete(users).where(ne(users.id, 'admin')).run();
    const admin = await as('admin');
    expect((await admin.put('/api/admin/settings').send({ k: 4, seed: 7, init: 'kmeans++', approach })).status).toBe(200);
    const overview = await admin.get('/api/admin/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.model).toMatchObject({ k: 0, nS: 0, nT: 0 });
    expect((await admin.get('/api/lab')).body.people).toEqual([]);
    const student = request.agent(app);
    const signup = await student.post('/api/auth/signup').send({ role: 'student', name: 'First Student', email: 'first@example.test', password: 'test123', profile });
    expect(signup.status).toBe(201);
    expect(signup.body.cluster).toBeNull();
    const home = await student.get('/api/student/home');
    expect(home.status).toBe(200);
    expect(home.body).toMatchObject({ cluster: null, top: [] });
    expect((await student.get('/api/matches')).body).toEqual({ matches: null, reason: 'no_tutors' });
    expect((await student.put('/api/me/profile').send({ name: 'First Student', profile })).status).toBe(200);
    expect((await student.get('/api/auth/me')).body.me.email).toBe('first@example.test');
  });

  it('recovers tutor-only matches when the last tutor is reactivated', async () => {
    const admin = await as('admin');
    const student = await as('s1');
    await admin.put('/api/admin/settings').send({ k: 4, seed: 7, init: 'kmeans++', approach: 'tutor' });
    expect((await student.get('/api/matches')).body.matches.inCluster).toHaveLength(1);
    await admin.post('/api/admin/users/t1/status').send({ status: 'deactivated' });
    expect((await student.get('/api/matches')).body).toEqual({ matches: null, reason: 'no_tutors' });
    expect((await admin.get('/api/admin/overview')).status).toBe(200);
    await admin.post('/api/admin/users/t1/status').send({ status: 'active' });
    expect((await student.get('/api/matches')).body.matches.inCluster).toHaveLength(1);
  });
});
