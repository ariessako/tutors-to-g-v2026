import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { close, serve } from './serve';
import { hashPassword } from '../server/auth';
import { openDb } from '../server/db';
import { applications, tutoringSessions, users } from '../server/db/schema';
import { iso, slotDate } from '../shared/format';
import type { SessionStatus } from '../shared/types';

let db: ReturnType<typeof openDb>;
let app: ReturnType<typeof serve>;
let dir: string;
let passwordHash: string;
const date = (slot = 'Mon 09:00') => iso(slotDate(slot));
const profile = { hobbies: ['Coding', 'Anime', 'Music'], learning: 'Visual', social: 0.3, approach: 0.8, subjects: ['Math'], sched: ['Weekends'], grades: ['Senior High'] };

beforeAll(async () => { passwordHash = await hashPassword('test123'); });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ttg-booking-test-'));
  db = openDb(join(dir, 'test.db'));
  for (const [id, role] of [['s1', 'student'], ['s2', 'student'], ['t1', 'teacher'], ['t2', 'teacher']] as const) {
    db.insert(users).values({ id, role, name: id, email: `${id}@example.test`, passwordHash, joined: '2026-01-01', profile, rate: 400, slots: ['Mon 08:00', 'Mon 09:00', 'Mon 10:00', 'Mon 11:00', 'Mon 12:00', 'Tue 09:00'] }).run();
    if (role === 'teacher') db.insert(applications).values({ userId: id, status: 'approved' }).run();
  }
  app = serve(createApp({ db, uploadsDir: join(dir, 'uploads'), demo: false }).app);
});
afterEach(async () => {
  await close(app);
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

async function as(id: string, target = app) {
  const agent = request.agent(target);
  expect((await agent.post('/api/auth/login').send({ email: `${id}@example.test`, password: 'test123' })).status).toBe(200);
  return agent;
}
const payload = (tutorId = 't1', slot = 'Mon 09:00', hours = 1, onDate = date(slot)) => ({ tutorId, slot, hours, date: onDate, subject: 'Math', mode: 'In-person', topic: 'Practice algebra' });
function legacy(id: string, status: SessionStatus, tutorId = 't1', studentId = 's1', slot = 'Mon 09:00', hours = 2) {
  db.insert(tutoringSessions).values({ id, status, tutorId, studentId, slot, hours, date: date(slot), subject: 'Math', mode: 'In-person', topic: 'Existing lesson', amount: 400 * hours, createdAt: new Date().toISOString() }).run();
}

describe('instructor confirmation conflicts', () => {
  it.each(['pending', 'declined'] as const)('allows requests and shows scheduled slots despite %s sessions', async (status) => {
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

  it.each(['accepted', 'completed'] as const)('shows a tutor’s %s session as booked and refuses requests for it', async (status) => {
    legacy('existing', status);
    const student = await as('s2');
    for (const hours of [1, 1.5, 2]) {
      const listing = (await student.get(`/api/tutors/t1/booking?hours=${hours}`)).body.slots as { slot: string; taken: boolean }[];
      const taken = (slot: string) => listing.find((o) => o.slot === slot)!.taken;
      expect(taken('Mon 09:00')).toBe(true);
      expect(taken('Mon 10:00')).toBe(true);
      expect(taken('Mon 11:00')).toBe(false);
      // A longer session starting before the booking runs into it.
      expect(taken('Mon 08:00')).toBe(hours > 1);
    }
    const result = await student.post('/api/sessions').send(payload('t1', 'Mon 10:00'));
    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/already booked/);
    // Another tutor at the same time is still open.
    expect((await student.post('/api/sessions').send(payload('t2', 'Mon 10:00'))).status).toBe(201);
  });

  it.each(['accepted', 'completed'] as const)('rejects confirmation overlapping a tutor’s %s session', async (status) => {
    legacy('existing', status);
    legacy('request', 'pending', 't1', 's2', 'Mon 10:00', 1);
    const tutor = await as('t1');
    const result = await tutor.post('/api/sessions/request/respond').send({ accept: true });
    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/Cannot confirm.*you already have another session/);
    expect(db.select().from(tutoringSessions).where(eq(tutoringSessions.id, 'request')).get()!.status).toBe('pending');
  });

  it('checks longer intervals starting before an existing session, including half-hours', async () => {
    legacy('existing', 'accepted', 't1', 's2', 'Mon 10:00', 1);
    const student = await as('s1');
    const tutor = await as('t1');
    for (const hours of [1.5, 2]) {
      expect((await student.post('/api/sessions').send(payload('t1', 'Mon 09:00', hours))).status).toBe(409);
      legacy(`long${hours}`, 'pending', 't1', 's1', 'Mon 09:00', hours);
      expect((await tutor.post(`/api/sessions/long${hours}/respond`).send({ accept: true })).status).toBe(409);
    }
    const adjacent = await student.post('/api/sessions').send(payload());
    expect((await tutor.post(`/api/sessions/${adjacent.body.id}/respond`).send({ accept: true })).status).toBe(200);
  });

  it.each(['accepted', 'completed'] as const)('blocks a student conflict across tutors against a %s session', async (status) => {
    legacy('existing', status);
    const student = await as('s1');
    // The student can't request a time that overlaps a session they already have, with any tutor.
    const listing = (await student.get('/api/tutors/t2/booking?hours=1.5')).body.slots as { slot: string; busy: boolean; taken: boolean }[];
    const at = (slot: string) => listing.find((o) => o.slot === slot)!;
    expect([at('Mon 08:00').busy, at('Mon 09:00').busy, at('Mon 10:00').busy, at('Mon 11:00').busy]).toEqual([true, true, true, false]);
    expect(at('Mon 10:00').taken).toBe(false);
    const created = await student.post('/api/sessions').send(payload('t2', 'Mon 10:00', 1.5));
    expect(created.status).toBe(409);
    expect(created.body.error).toMatch(/You already have a session at that time/);
    // A request that predates the confirmed session still can't be accepted.
    legacy('older-request', 'pending', 't2', 's1', 'Mon 10:00', 1.5);
    const tutor = await as('t2');
    const result = await tutor.post('/api/sessions/older-request/respond').send({ accept: true });
    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/Cannot confirm.*this student already has another session/);
  });

  it('declines the student’s other overlapping requests when one is accepted', async () => {
    const student = await as('s1');
    const withT1 = await student.post('/api/sessions').send(payload('t1', 'Mon 09:00', 2));
    const withT2 = await student.post('/api/sessions').send(payload('t2', 'Mon 10:00'));
    const later = await student.post('/api/sessions').send(payload('t2', 'Mon 11:00'));
    expect([withT1.status, withT2.status, later.status]).toEqual([201, 201, 201]);
    const t1 = await as('t1');
    expect((await t1.post(`/api/sessions/${withT1.body.id}/respond`).send({ accept: true })).body.autoDeclined).toBe(1);
    const row = (id: string) => db.select().from(tutoringSessions).where(eq(tutoringSessions.id, id)).get()!;
    expect(row(withT2.body.id)).toMatchObject({ status: 'declined', declineReason: 'You already have a session at this time.' });
    expect(row(later.body.id).status).toBe('pending');
  });

  it('allows confirming back-to-back sessions and the same time on a different date', async () => {
    legacy('existing', 'accepted');
    const student = await as('s1');
    const tutor = await as('t1');
    for (const data of [payload('t1', 'Mon 11:00'), payload('t1', 'Tue 09:00', 2)]) {
      const created = await student.post('/api/sessions').send(data);
      expect(created.status).toBe(201);
      expect((await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true })).status).toBe(200);
    }
  });

  it('does not reserve pending or declined intervals', async () => {
    legacy('pending', 'pending', 't1', 's1', 'Mon 09:00', 2);
    legacy('declined', 'declined');
    const student = await as('s2');
    const created = await student.post('/api/sessions').send(payload('t1', 'Mon 10:00'));
    const tutor = await as('t1');
    expect((await tutor.post(`/api/sessions/${created.body.id}/respond`).send({ accept: true })).status).toBe(200);
    expect((await tutor.post('/api/sessions/pending/respond').send({ accept: true })).status).toBe(409);
  });

  it('declines the tutor’s other pending requests that overlap an accepted one', async () => {
    const s1 = await as('s1');
    const s2 = await as('s2');
    const accepted = await s1.post('/api/sessions').send(payload('t1', 'Mon 09:00', 1.5));
    const overlapping = await s2.post('/api/sessions').send(payload('t1', 'Mon 10:00'));
    const sameTime = await s2.post('/api/sessions').send(payload('t1', 'Mon 09:00'));
    const after = await s2.post('/api/sessions').send(payload('t1', 'Mon 11:00'));
    const otherTutor = await s1.post('/api/sessions').send(payload('t2', 'Mon 12:00'));
    const studentElsewhere = await s2.post('/api/sessions').send(payload('t2', 'Mon 09:00'));
    const tutor = await as('t1');
    const result = await tutor.post(`/api/sessions/${accepted.body.id}/respond`).send({ accept: true });
    expect(result.status).toBe(200);
    expect(result.body.autoDeclined).toBe(2);
    const status = (id: string) => db.select().from(tutoringSessions).where(eq(tutoringSessions.id, id)).get()!;
    expect(status(overlapping.body.id).status).toBe('declined');
    expect(status(sameTime.body.id).status).toBe('declined');
    for (const r of [after, otherTutor, studentElsewhere]) expect(status(r.body.id).status).toBe('pending');
    const mine = (await s2.get('/api/sessions')).body.sessions.find((x: { id: string }) => x.id === overlapping.body.id);
    expect(mine.declineReason).toBe('The tutor is already booked at this time.');
    // Declining a request does not touch the others.
    expect((await tutor.post(`/api/sessions/${after.body.id}/respond`).send({ accept: false })).body.autoDeclined).toBe(0);
    expect(status(after.body.id).declineReason).toBeNull();
  });

  it('does not reopen a confirmed interval after early completion', async () => {
    legacy('existing', 'accepted');
    const tutor = await as('t1');
    expect((await tutor.post('/api/sessions/existing/complete').send({ attendance: 'present', topics: 'Fractions review' })).status).toBe(200);
    const student = await as('s2');
    expect((await student.post('/api/sessions').send(payload())).status).toBe(409);
    legacy('request', 'pending', 't1', 's2', 'Mon 09:00', 1);
    expect((await tutor.post('/api/sessions/request/respond').send({ accept: true })).status).toBe(409);
  });

  it.each(['tutor', 'student'] as const)('allows competing requests but only one confirmation for a %s conflict across database connections', async (kind) => {
    const secondDb = openDb(join(dir, 'test.db'));
    const otherApp = serve(createApp({ db: secondDb, uploadsDir: join(dir, 'uploads'), demo: false }).app);
    try {
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
      // The losing request overlaps the winner (same tutor or same student), so it is declined automatically.
      expect(db.select().from(tutoringSessions).all().map((s) => s.status).sort()).toEqual(['accepted', 'declined']);
    } finally { await close(otherApp); secondDb.$client.close(); }
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

describe('tutor availability', () => {
  it('shows saved hours to students in schedule order, whatever order they were picked in', async () => {
    const tutor = await as('t1');
    const picked = ['Sat 10:00', 'Mon 17:00', 'Mon 09:00', 'Sun 08:00', 'Mon 17:00', 'Wed 13:00'];
    expect((await tutor.put('/api/me/slots').send({ slots: picked })).status).toBe(200);
    const sorted = ['Mon 09:00', 'Mon 17:00', 'Wed 13:00', 'Sat 10:00', 'Sun 08:00'];
    expect((await tutor.get('/api/auth/me')).body.me.tutor.slots).toEqual(sorted);
    const student = await as('s1');
    expect((await student.get('/api/tutors/t1')).body.tutor.slots).toEqual(sorted);
    const booking = (await student.get('/api/tutors/t1/booking')).body.slots as { date: string; slot: string }[];
    expect(booking.map((o) => o.slot).sort()).toEqual([...sorted].sort());
    const times = booking.map((o) => `${o.date} ${o.slot.split(' ')[1]}`);
    expect(times).toEqual([...times].sort());
  });
});

describe('slotDate', () => {
  // Wednesday, Oct 14 2026, 08:30 local time.
  const now = new Date(2026, 9, 14, 8, 30);
  it.each([
    ['Wed 18:00', '2026-10-14'],
    ['Wed 08:00', '2026-10-21'],
    ['Thu 09:00', '2026-10-15'],
    ['Tue 17:00', '2026-10-20'],
    ['Sun 08:00', '2026-10-18'],
  ])('puts %s on %s', (slot, expected) => {
    expect(iso(slotDate(slot, now))).toBe(expected);
  });
});
