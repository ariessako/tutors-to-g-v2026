import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { hashPassword } from '../server/auth';
import { openDb } from '../server/db';
import { applications, tutoringSessions, users } from '../server/db/schema';
import { iso, nextDate } from '../shared/format';
import type { SessionStatus } from '../shared/types';

let db: ReturnType<typeof openDb>;
let app: ReturnType<typeof createApp>['app'];
let dir: string;
let passwordHash: string;
const date = () => iso(nextDate('Mon'));
const profile = { hobbies: ['Coding', 'Anime', 'Music'], learning: 'Visual', social: 0.3, approach: 0.8, subjects: ['Math'], sched: ['Weekends'], grades: ['Senior High'] };

beforeAll(async () => { passwordHash = await hashPassword('test123'); });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ttg-booking-test-'));
  db = openDb(join(dir, 'test.db'));
  for (const [id, role] of [['s1', 'student'], ['s2', 'student'], ['t1', 'teacher'], ['t2', 'teacher']] as const) {
    db.insert(users).values({ id, role, name: id, email: `${id}@example.test`, passwordHash, joined: '2026-01-01', profile, rate: 400, slots: ['Mon 08:00', 'Mon 09:00', 'Mon 10:00', 'Mon 11:00', 'Mon 12:00', 'Tue 09:00'] }).run();
    if (role === 'teacher') db.insert(applications).values({ userId: id, status: 'approved' }).run();
  }
  app = createApp({ db, uploadsDir: join(dir, 'uploads'), demo: false }).app;
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

async function as(id: string, target = app) {
  const agent = request.agent(target);
  expect((await agent.post('/api/auth/login').send({ email: `${id}@example.test`, password: 'test123' })).status).toBe(200);
  return agent;
}
const payload = (tutorId = 't1', slot = 'Mon 09:00', hours = 1, onDate = date()) => ({ tutorId, slot, hours, date: onDate, subject: 'Math', mode: 'In-person', topic: 'Practice algebra' });
function legacy(id: string, status: SessionStatus, tutorId = 't1', studentId = 's1', slot = 'Mon 09:00', hours = 2) {
  db.insert(tutoringSessions).values({ id, status, tutorId, studentId, slot, hours, date: date(), subject: 'Math', mode: 'In-person', topic: 'Existing lesson', amount: 400 * hours, createdAt: new Date().toISOString() }).run();
}

describe('instructor confirmation conflicts', () => {
  it.each(['pending', 'accepted', 'completed', 'declined'] as const)('allows requests and shows scheduled slots despite %s sessions', async (status) => {
    legacy('existing', status);
    for (const [studentId, tutorId] of [['s2', 't1'], ['s1', 't2']]) {
      const student = await as(studentId);
      for (const hours of [1, 1.5, 2]) {
        const listing = await student.get(`/api/tutors/${tutorId}/booking?hours=${hours}`);
        expect(listing.body.slots.map((s: { slot: string }) => s.slot)).toContain('Mon 10:00');
        const result = await student.post('/api/sessions').send(payload(tutorId, 'Mon 10:00', hours));
        expect(result.status).toBe(201);
        expect(db.select().from(tutoringSessions).where(eq(tutoringSessions.id, result.body.id)).get()!.status).toBe('pending');
      }
    }
  });

  it.each(['accepted', 'completed'] as const)('rejects confirmation overlapping a tutor’s %s session', async (status) => {
    legacy('existing', status);
    const student = await as('s2');
    const created = await student.post('/api/sessions').send(payload('t1', 'Mon 10:00'));
    expect(created.status).toBe(201);
    const tutor = await as('t1');
    const result = await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true });
    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/Cannot confirm.*you already have another session/);
    expect(db.select().from(tutoringSessions).where(eq(tutoringSessions.id, created.body.id)).get()!.status).toBe('pending');
  });

  it('checks longer intervals starting before an existing session, including half-hours', async () => {
    legacy('existing', 'accepted', 't1', 's2', 'Mon 10:00', 1);
    const student = await as('s1');
    const tutor = await as('t1');
    for (const hours of [1.5, 2]) {
      const created = await student.post('/api/sessions').send(payload('t1', 'Mon 09:00', hours));
      expect(created.status).toBe(201);
      expect((await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true })).status).toBe(409);
    }
    const adjacent = await student.post('/api/sessions').send(payload());
    expect((await tutor.post(`/api/sessions/${adjacent.body.id}/respond`).send({ accept: true })).status).toBe(200);
  });

  it.each(['accepted', 'completed'] as const)('blocks a student conflict across tutors against a %s session', async (status) => {
    legacy('existing', status);
    const student = await as('s1');
    const created = await student.post('/api/sessions').send(payload('t2', 'Mon 10:00', 1.5));
    expect(created.status).toBe(201);
    const tutor = await as('t2');
    const result = await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true });
    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/Cannot confirm.*this student already has another session/);
  });

  it('allows confirming back-to-back sessions and the same time on a different date', async () => {
    legacy('existing', 'accepted');
    const student = await as('s1');
    const tutor = await as('t1');
    for (const data of [payload('t1', 'Mon 11:00'), payload('t1', 'Tue 09:00', 2, iso(nextDate('Tue')))]) {
      const created = await student.post('/api/sessions').send(data);
      expect(created.status).toBe(201);
      expect((await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true })).status).toBe(200);
    }
  });

  it('does not reserve pending or declined intervals', async () => {
    legacy('pending', 'pending');
    legacy('declined', 'declined');
    const student = await as('s2');
    const created = await student.post('/api/sessions').send(payload('t1', 'Mon 10:00'));
    const tutor = await as('t1');
    expect((await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true })).status).toBe(200);
    expect((await tutor.post('/api/sessions/pending/respond').send({ accept: true })).status).toBe(409);
    expect((await tutor.post('/api/sessions/pending/respond').send({ accept: false })).status).toBe(200);
  });

  it('does not reopen a confirmed interval after early completion', async () => {
    legacy('existing', 'accepted');
    const tutor = await as('t1');
    expect((await tutor.post('/api/sessions/existing/complete')).status).toBe(200);
    const student = await as('s2');
    const created = await student.post('/api/sessions').send(payload());
    expect(created.status).toBe(201);
    expect((await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true })).status).toBe(409);
  });

  it.each(['tutor', 'student'] as const)('allows competing requests but only one confirmation for a %s conflict across database connections', async (kind) => {
    const secondDb = openDb(join(dir, 'test.db'));
    try {
      const otherApp = createApp({ db: secondDb, uploadsDir: join(dir, 'uploads'), demo: false }).app;
      const first = await as('s1');
      const second = await as(kind === 'tutor' ? 's2' : 's1', otherApp);
      const requests = await Promise.all([
        first.post('/api/sessions').send(payload('t1', 'Mon 09:00', 2)),
        second.post('/api/sessions').send(payload(kind === 'tutor' ? 't1' : 't2', 'Mon 10:00')),
      ]);
      expect(requests.map((r) => r.status)).toEqual([201, 201]);
      const firstTutor = await as('t1');
      const secondTutor = await as(kind === 'tutor' ? 't1' : 't2', otherApp);
      const confirmations = await Promise.all([
        firstTutor.post(`/api/sessions/${requests[0].body.id}/respond`).send({ accept: true }),
        secondTutor.post(`/api/sessions/${requests[1].body.id}/respond`).send({ accept: true }),
      ]);
      expect(confirmations.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(db.select().from(tutoringSessions).all().map((s) => s.status).sort()).toEqual(['accepted', 'pending']);
    } finally { secondDb.$client.close(); }
  });

  it('still validates schedule dates and duration choices', async () => {
    const student = await as('s1');
    expect((await student.get('/api/tutors/t1/booking')).body.slots).toEqual((await student.get('/api/tutors/t1/booking?hours=2')).body.slots);
    for (const hours of ['0', '3', 'abc', '']) expect((await student.get(`/api/tutors/t1/booking?hours=${hours}`)).status).toBe(400);
    expect((await student.post('/api/sessions').send(payload('t1', 'Mon 09:00', 3))).status).toBe(400);
    expect((await student.post('/api/sessions').send(payload('t1', 'Mon 15:00'))).status).toBe(409);
    expect((await student.post('/api/sessions').send(payload('t1', 'Mon 09:00', 1, '2000-01-03'))).status).toBe(409);
  });
});
