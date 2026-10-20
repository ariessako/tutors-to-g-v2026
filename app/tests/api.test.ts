import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../server/db';
import { createApp } from '../server/app';
import { close, serve } from './serve';
import { seedDemo } from '../server/seed';
import { TERMS_VERSION } from '../shared/terms';
import { rateError } from '../shared/tiers';
import { addDays, iso, parseIso } from '../shared/format';

let app: ReturnType<typeof serve>;
let uploads: string;
const PDF = Buffer.from('%PDF-1.4\n%test\n');

beforeAll(async () => {
  uploads = mkdtempSync(join(tmpdir(), 'ttg-test-'));
  const db = openDb(':memory:');
  await seedDemo(db, uploads);
  app = serve(createApp({ db, uploadsDir: uploads, demo: true }).app);
});
afterAll(() => rmSync(uploads, { recursive: true, force: true }));

async function as(email: string) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ email, password: 'demo123' });
  expect(r.status).toBe(200);
  return agent;
}

describe('auth', () => {
  it('rejects a wrong password', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'bea@student.ph', password: 'nope' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Email or password is incorrect.');
  });

  it('signs up a student, places them in a cluster and logs them in', async () => {
    const agent = request.agent(app);
    const r = await agent.post('/api/auth/signup').send({
      role: 'student', name: 'Test Student', email: 'new.student@example.com', password: 'secret1', gradeLabel: 'Grade 9', school: 'Test HS',
      profile: { hobbies: ['Coding', 'Anime', 'Music'], learning: 'Visual', social: 0.3, approach: 0.8, subjects: ['Programming'], sched: ['Weekday evenings'], grades: ['Senior High'] },
    });
    expect(r.status).toBe(201);
    expect(r.body.cluster.no).toBeGreaterThan(0);
    const m = await agent.get('/api/matches');
    expect(m.body.matches.inCluster.length).toBeGreaterThan(0);
    // Tutors outside the cluster who still cover every need get their own section.
    const inCluster = new Set(m.body.matches.inCluster.map((t: { id: string }) => t.id));
    for (const t of m.body.matches.coverAll) {
      expect(inCluster.has(t.id)).toBe(false);
      expect(t.covers.full).toBe(true);
      expect(t.covers.subjects).toEqual(['Programming']);
    }
  });

  it('makes tutors accept the terms and records the version', async () => {
    const body = {
      role: 'teacher', name: 'Terms Tutor', email: 'terms.tutor@example.com', password: 'secret1',
      profile: { hobbies: ['Coding', 'Anime', 'Music'], learning: 'Visual', social: 0.3, approach: 0.8, subjects: ['Programming'], sched: ['Weekday evenings'], grades: ['Senior High'] },
    };
    const refused = await request(app).post('/api/auth/signup').send(body);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Terms and Conditions/);
    const agent = request.agent(app);
    const ok = await agent.post('/api/auth/signup').send({ ...body, acceptTerms: true });
    expect(ok.status).toBe(201);
    const admin = await as('admin@tutorstogo.ph');
    const detail = (await admin.get(`/api/admin/applications/${ok.body.me.id}`)).body.application;
    expect(detail.termsVersion).toBe(TERMS_VERSION);
    expect(detail.termsAcceptedAt).toBeTruthy();
  });

  it('refuses a duplicate email', async () => {
    const r = await request(app).post('/api/auth/signup').send({ role: 'parent', name: 'Dup', email: 'BEA@student.ph', password: 'secret1' });
    expect(r.status).toBe(409);
  });
});

describe('access control', () => {
  it('keeps students out of admin endpoints', async () => {
    const bea = await as('bea@student.ph');
    expect((await bea.get('/api/admin/overview')).status).toBe(403);
    expect((await request(app).get('/api/admin/overview')).status).toBe(401);
  });

  it('hides anonymous review authors from everyone but admins', async () => {
    const bea = await as('bea@student.ph');
    const pub = await bea.get('/api/tutors/t_paolo');
    // Every review is anonymous to non-admins.
    expect(pub.body.reviews.length).toBeGreaterThan(0);
    for (const r of pub.body.reviews) expect([r.author, r.authorId]).toEqual([null, null]);
    const anon = pub.body.reviews.find((r: { anonymous: boolean }) => r.anonymous);
    expect(anon.authorId).toBeNull();
    expect(anon.author).toBeNull();
    expect(anon.by).toBe('Anonymous student');
    const admin = await as('admin@tutorstogo.ph');
    const all = await admin.get('/api/admin/reviews');
    const same = all.body.reviews.find((r: { id: string }) => r.id === anon.id);
    expect(same.author).toBeTruthy();
  });

  it('anonymizes other students in the lab for non-admins', async () => {
    const bea = await as('bea@student.ph');
    const lab = await bea.get('/api/lab');
    const students = lab.body.people.filter((p: { role: string }) => p.role === 'student');
    expect(students.find((p: { id: string }) => p.id === 's_bea').name).toBe('Bea Santos');
    expect(students.filter((p: { name: string }) => p.name.startsWith('Student ')).length).toBe(students.length - 1);
    expect(lab.body.canEdit).toBe(false);
  });

  it('only lets group members read a group', async () => {
    const outsider = await as('jen@tutor.ph');
    expect((await outsider.get('/api/groups/g1')).status).toBe(403);
    const bea = await as('bea@student.ph');
    expect((await bea.get('/api/groups/g1')).body.group.isMember).toBe(true);
    // Invited but not yet a member: can see the group, can't post.
    expect((await bea.get('/api/groups/g2')).status).toBe(200);
    expect((await bea.post('/api/groups/g2/threads').send({ title: 'Hi', text: 'Hello' })).status).toBe(403);
  });
});

describe('booking and payment flow', () => {
  it('goes from request to paid, with the receipt visible only to its owner and admins', async () => {
    const bea = await as('bea@student.ph');
    const booking = await bea.get('/api/tutors/t_paolo/booking');
    // The first slot varies by weekday and can already be reserved by the seed.
    const slot = booking.body.slots.find((s: { slot: string }) => s.slot === 'Mon 18:00');
    expect(slot).toBeDefined();
    const req = await bea.post('/api/sessions').send({ tutorId: 't_paolo', subject: 'Math', date: slot.date, slot: slot.slot, hours: 1, mode: 'In-person', topic: 'Trigonometry basics' });
    expect(req.status).toBe(201);
    // Students can request the same slot; the instructor can only confirm one.
    const dup = await bea.post('/api/sessions').send({ tutorId: 't_paolo', subject: 'Math', date: slot.date, slot: slot.slot, hours: 1, mode: 'In-person', topic: 'Trigonometry basics' });
    expect(dup.status).toBe(201);

    // Paying before the tutor accepts is refused.
    const early = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('amount', '450').attach('receipt', PDF, { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(early.status).toBe(409);

    const paolo = await as('paolo.reyes@tutor.ph');
    expect((await paolo.post(`/api/sessions/${req.body.id}/respond`).send({ accept: true })).status).toBe(200);
    expect((await paolo.post(`/api/sessions/${dup.body.id}/respond`).send({ accept: true })).status).toBe(409);

    const pay = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('amount', '450').attach('receipt', PDF, { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(pay.status).toBe(200);

    const studentPending = await bea.get('/api/sessions');
    const pending = studentPending.body.sessions.find((s: { id: string }) => s.id === req.body.id);
    expect(pending.payment.status).toBe('for_review');
    const tutorPending = await paolo.get('/api/sessions');
    expect(tutorPending.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('for_review');
    const duplicateReceipt = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('amount', '450').attach('receipt', PDF, { filename: 'duplicate.pdf', contentType: 'application/pdf' });
    expect(duplicateReceipt.status).toBe(409);
    const admin = await as('admin@tutorstogo.ph');
    const pays = await admin.get('/api/admin/payments');
    const row = pays.body.payments.find((p: { sessionId: string; status: string }) => p.sessionId === req.body.id && p.status === 'for_review');
    expect((await bea.post(`/api/admin/payments/${row.id}`).send({ approve: true })).status).toBe(403);
    expect(row.status).toBe('for_review');
    expect(row.reference).toBeNull();
    expect((await admin.get(`/api/files/${row.receiptFileId}`)).status).toBe(200);
    expect((await bea.get(`/api/files/${row.receiptFileId}`)).status).toBe(200);
    expect((await paolo.get(`/api/files/${row.receiptFileId}`)).status).toBe(404);

    expect((await admin.post(`/api/admin/payments/${row.id}`).send({ approve: false })).status).toBe(200);
    const rejected = await bea.get('/api/sessions');
    expect(rejected.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('rejected');
    const resubmit = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('reference', 'CORRECTED123').field('amount', '450').attach('receipt', PDF, { filename: 'corrected.pdf', contentType: 'application/pdf' });
    expect(resubmit.status).toBe(200);
    const updatedPays = await admin.get('/api/admin/payments');
    const updatedRow = updatedPays.body.payments.find((p: { sessionId: string; status: string }) => p.sessionId === req.body.id && p.status === 'for_review');
    expect(updatedRow.status).toBe('for_review');
    expect(updatedRow.reference).toBe('CORRECTED123');
    expect(updatedRow.receiptName).toBe('corrected.pdf');
    expect(updatedRow.receiptFileId).not.toBe(row.receiptFileId);
    expect((await admin.get(`/api/files/${updatedRow.receiptFileId}`)).status).toBe(200);

    expect((await admin.post(`/api/admin/payments/${updatedRow.id}`).send({ approve: true })).status).toBe(200);
    const mine = await paolo.get('/api/sessions');
    expect(mine.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('paid');
    const studentPaid = await bea.get('/api/sessions');
    expect(studentPaid.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('paid');
    expect((await admin.post(`/api/admin/payments/${updatedRow.id}`).send({ approve: true })).status).toBe(409);
    expect((await bea.post(`/api/sessions/${req.body.id}/receipt`).field('amount', '450').attach('receipt', PDF, { filename: 'again.pdf', contentType: 'application/pdf' })).body.error).toMatch(/already paid/);
  });

  it('takes installments within the tutor’s terms and confirms each with an acknowledgment', async () => {
    const bea = await as('bea@student.ph');
    // Bea's Tuesday Math session with Paolo: PHP 675, up to 3 parts, first part at least 40%.
    const s = (await bea.get('/api/sessions')).body.sessions.find((x: { status: string; amount: number; payment: { planParts: number } }) => x.status === 'accepted' && x.amount === 675 && x.payment.planParts === 3);
    expect(s.payment).toMatchObject({ status: 'unpaid', balance: 675, nextPart: 1, minNext: 270, installments: true, canPay: true, nextDue: s.date });
    // Part 1 is due on the session date, then every 7 days; suggested amounts follow the 40% floor and split the rest.
    const week = (n: number) => iso(addDays(parseIso(s.date), 7 * n));
    expect(s.payment.schedule).toEqual([
      { part: 1, dueDate: s.date, suggested: 270, status: 'due' },
      { part: 2, dueDate: week(1), suggested: 202, status: 'upcoming' },
      { part: 3, dueDate: week(2), suggested: 203, status: 'upcoming' },
    ]);
    const send = (amount: number, plan = 'installment') =>
      bea.post(`/api/sessions/${s.id}/receipt`).field('amount', String(amount)).field('plan', plan).attach('receipt', PDF, { filename: `part-${amount}.pdf`, contentType: 'application/pdf' });
    expect((await send(200)).body.error).toMatch(/at least ₱270/);
    expect((await send(300, 'full')).body.error).toMatch(/in full means ₱675/);
    expect((await send(700)).body.error).toMatch(/balance is ₱675/);
    expect((await send(300)).status).toBe(200);

    const admin = await as('admin@tutorstogo.ph');
    const pending = () => admin.get('/api/admin/payments').then((r) => r.body.payments.find((p: { sessionId: string; status: string }) => p.sessionId === s.id && p.status === 'for_review'));
    const first = await pending();
    expect(first).toMatchObject({ part: 1, planParts: 3, amount: 300, due: 675 });
    const ok1 = await admin.post(`/api/admin/payments/${first.id}`).send({ approve: true });
    expect(ok1.body).toMatchObject({ status: 'partial', balance: 375 });

    const after = (await bea.get('/api/sessions')).body.sessions.find((x: { id: string }) => x.id === s.id).payment;
    expect(after).toMatchObject({ status: 'partial', paid: 300, balance: 375, nextPart: 2, minNext: 1, nextDue: week(1) });
    expect(after.schedule.map((x: { status: string }) => x.status)).toEqual(['paid', 'due', 'upcoming']);
    expect(first.dueDate).toBe(s.date);
    expect(after.receipts).toHaveLength(1);
    const home = (await bea.get('/api/student/home')).body.received;
    expect(home.find((p: { id: string }) => p.id === first.id)).toMatchObject({ amount: 300, part: 1, balance: 375 });
    const ack = await bea.get(`/api/payments/${first.id}/acknowledgment.pdf`);
    expect(ack.status).toBe(200);
    expect(ack.headers['content-type']).toBe('application/pdf');
    expect(ack.body.toString('latin1')).toMatch(/Payment acknowledgment[\s\S]*PHP 300\.00[\s\S]*Balance: PHP 375\.00[\s\S]*Next installment: part 2, due/);
    const liza = await as('liza@parent.ph');
    expect((await liza.get(`/api/payments/${first.id}/acknowledgment.pdf`)).status).toBe(200);
    const stranger = await as('jen@tutor.ph');
    expect((await stranger.get(`/api/payments/${first.id}/acknowledgment.pdf`)).status).toBe(404);

    // Part 2 of 3 can be any amount; part 3 would have to clear the balance.
    expect((await send(100)).status).toBe(200);
    await admin.post(`/api/admin/payments/${(await pending()).id}`).send({ approve: true });
    const third = (await bea.get('/api/sessions')).body.sessions.find((x: { id: string }) => x.id === s.id).payment;
    expect(third).toMatchObject({ nextPart: 3, minNext: 275, balance: 275 });
    expect((await send(100)).body.error).toMatch(/last installment/);
    expect((await send(275)).status).toBe(200);
    const last = await admin.post(`/api/admin/payments/${(await pending()).id}`).send({ approve: true });
    expect(last.body).toMatchObject({ status: 'paid', balance: 0 });
  });

  it('only allows paying in full when the tutor doesn’t offer installments', async () => {
    const bea = await as('bea@student.ph');
    const admin = await as('admin@tutorstogo.ph');
    const tutors = (await admin.get('/api/admin/tutors')).body.tutors as { id: string; email: string }[];
    const other = tutors.find((t) => t.id !== 't_paolo')!;
    const booking = (await bea.get(`/api/tutors/${other.id}/booking`)).body;
    const slot = booking.slots.find((o: { taken: boolean }) => !o.taken);
    const req = await bea.post('/api/sessions').send({ tutorId: other.id, subject: booking.subjects[0], date: slot.date, slot: slot.slot, hours: 1, mode: 'In-person', topic: 'Pay in full check' });
    expect(req.status).toBe(201);
    const tutor = await as(other.email);
    expect((await tutor.post(`/api/sessions/${req.body.id}/respond`).send({ accept: true })).status).toBe(200);
    const session = (await bea.get('/api/sessions')).body.sessions.find((x: { id: string }) => x.id === req.body.id);
    expect(session.payment).toMatchObject({ planParts: 1, installments: false, minNext: session.amount });
    const r = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('amount', '100').field('plan', 'installment').attach('receipt', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(r.body.error).toMatch(/doesn’t allow installments/);
    const half = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('amount', String(session.amount / 2)).attach('receipt', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(half.body.error).toMatch(/in full/);
  });

  it('rejects non-PDF, non-image uploads', async () => {
    const bea = await as('bea@student.ph');
    // The upload filter runs before the session is looked at, so any session will do.
    const s = (await bea.get('/api/sessions')).body.sessions[0];
    const r = await bea.post(`/api/sessions/${s.id}/receipt`).field('amount', '675').attach('receipt', Buffer.from('hi'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(r.status).toBe(400);
  });
});

describe('tutor application', () => {
  it('seeds mock documents the tutor and admins can open, but other tutors cannot', async () => {
    const paolo = await as('paolo.reyes@tutor.ph');
    const docs = (await paolo.get('/api/me/application')).body.application.docs;
    const prc = await paolo.get(`/api/files/${docs.prc.fileId}`);
    expect(prc.status).toBe(200);
    expect(prc.headers['content-type']).toBe('application/pdf');
    expect(prc.body.toString('latin1')).toMatch(/^%PDF-1\.4[\s\S]*Paolo Reyes/);
    const admin = await as('admin@tutorstogo.ph');
    expect((await admin.get(`/api/files/${docs.tor.fileId}`)).status).toBe(200);
    const jen = await as('jen@tutor.ph');
    expect((await jen.get(`/api/files/${docs.prc.fileId}`)).status).toBe(404);
  });

  it('seeds a mock receipt for every uploaded payment', async () => {
    const admin = await as('admin@tutorstogo.ph');
    const pays = (await admin.get('/api/admin/payments')).body.payments as { receiptName: string | null; receiptFileId: string | null }[];
    const withReceipt = pays.filter((p) => p.receiptName);
    expect(withReceipt.length).toBeGreaterThan(0);
    for (const p of withReceipt) expect(p.receiptFileId).toBeTruthy();
    expect((await admin.get(`/api/files/${withReceipt[0].receiptFileId}`)).status).toBe(200);
  });

  it('moves an applicant into the matching pool once approved', async () => {
    const jen = await as('jen@tutor.ph');
    const missing = await jen.post('/api/me/application').field('video', 'https://youtu.be/demo');
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/Still missing/);
    const sub = await jen
      .post('/api/me/application')
      .field('video', 'https://youtu.be/demo')
      .attach('prc', PDF, { filename: 'prc.pdf', contentType: 'application/pdf' })
      .attach('birth', PDF, { filename: 'psa.pdf', contentType: 'application/pdf' })
      .attach('tor', PDF, { filename: 'tor.pdf', contentType: 'application/pdf' });
    expect(sub.status).toBe(200);
    expect(sub.body.application.status).toBe('pending');

    const admin = await as('admin@tutorstogo.ph');
    const noNote = await admin.post('/api/admin/applications/t_jen/status').send({ status: 'rejected' });
    expect(noNote.status).toBe(400);
    expect((await admin.post('/api/admin/applications/t_jen/status').send({ status: 'approved' })).status).toBe(200);

    const lab = await admin.get('/api/lab');
    expect(lab.body.people.some((p: { id: string }) => p.id === 't_jen')).toBe(true);
  });
});

describe('tutor search', () => {
  it('searches all approved tutors with filters, keeping the match score', async () => {
    const bea = await as('bea@student.ph');
    const all = (await bea.get('/api/tutors')).body;
    expect(all.tutors.length).toBe(all.total);
    expect(all.tutors.length).toBeGreaterThan((await bea.get('/api/tutors?scope=cluster')).body.tutors.length);
    const pcts = all.tutors.map((t: { pct: number }) => t.pct);
    expect(pcts).toEqual([...pcts].sort((a: number, b: number) => b - a));

    const paolo = (await bea.get('/api/tutors?q=paolo')).body.tutors;
    expect(paolo.map((t: { name: string }) => t.name)).toEqual(['Paolo Reyes']);
    expect((await bea.get('/api/tutors?q=pasig')).body.tutors.some((t: { id: string }) => t.id === 't_paolo')).toBe(true);

    const filtered = (await bea.get('/api/tutors?subject=Math&maxRate=400&day=Sat&sort=price')).body.tutors as { subjects: string[]; rate: number; days: string[] }[];
    for (const t of filtered) {
      expect(t.subjects).toContain('Math');
      expect(t.rate).toBeLessThanOrEqual(400);
      expect(t.days).toContain('Sat');
    }
    expect(filtered.map((t) => t.rate)).toEqual(filtered.map((t) => t.rate).sort((a, b) => a - b));
    const rated = (await bea.get('/api/tutors?minRating=4.5')).body.tutors as { avg: number; count: number }[];
    for (const t of rated) expect(t.count > 0 && t.avg >= 4.5).toBe(true);
    expect((await bea.get('/api/tutors?subject=Astrology')).status).toBe(400);
  });
});

describe('session log', () => {
  it('records attendance, topics and notes when a tutor completes a session, with a timeline and CSV export', async () => {
    const paolo = await as('paolo.reyes@tutor.ph');
    const upcoming = (await paolo.get('/api/sessions')).body.sessions.find((s: { status: string; learner: string }) => s.status === 'accepted' && s.learner.startsWith('Bea'));
    expect((await paolo.post(`/api/sessions/${upcoming.id}/complete`).send({ attendance: 'present' })).status).toBe(400);
    const done = await paolo.post(`/api/sessions/${upcoming.id}/complete`).send({ attendance: 'late', actualHours: 1.25, topics: 'Factoring by grouping', notes: 'Homework: p. 42 items 1-8' });
    expect(done.status).toBe(200);
    const bea = await as('bea@student.ph');
    const mine = (await bea.get('/api/sessions')).body.sessions.find((s: { id: string }) => s.id === upcoming.id);
    expect(mine.log).toMatchObject({ attendance: 'late', actualHours: 1.25, topics: 'Factoring by grouping', notes: 'Homework: p. 42 items 1-8' });
    const kinds = mine.events.map((e: { kind: string }) => e.kind);
    expect(kinds.slice(0, 2)).toEqual(['requested', 'accepted']);
    expect(kinds.at(-1)).toBe('completed');
    expect(mine.events.at(-1)).toMatchObject({ by: 'Paolo Reyes', detail: 'Student was late' });
    const liza = await as('liza@parent.ph');
    expect((await liza.get('/api/parent/progress')).body.sessions.find((s: { id: string }) => s.id === upcoming.id).log.notes).toBe('Homework: p. 42 items 1-8');

    const admin = await as('admin@tutorstogo.ph');
    const logged = (await admin.get('/api/admin/sessions?status=completed')).body.sessions;
    expect(logged.every((s: { status: string }) => s.status === 'completed')).toBe(true);
    const csv = await admin.get('/api/admin/sessions.csv?status=completed');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toMatch(/^"Date","Time"/);
    expect(csv.text).toContain('"Factoring by grouping"');
    expect((await bea.get('/api/admin/sessions')).status).toBe(403);
  });
});

describe('parent links', () => {
  it('needs the student and then an admin before a parent sees a child', async () => {
    const parent = request.agent(app);
    const signup = await parent.post('/api/auth/signup').send({ role: 'parent', name: 'Test Parent', email: 'test.parent@example.com', password: 'secret1', childEmail: 'BEA@student.ph' });
    expect(signup.status).toBe(201);
    expect(signup.body.requested).toBe(true);
    expect((await parent.get('/api/parent/progress')).body.child).toBeNull();
    expect((await parent.get('/api/sessions')).body.sessions).toEqual([]);
    expect((await parent.get('/api/parent/progress?child=s_bea')).status).toBe(404);
    expect((await parent.post('/api/parent/links').send({ email: 'bea@student.ph' })).status).toBe(409);
    expect((await parent.post('/api/parent/links').send({ email: 'nobody@student.ph' })).status).toBe(404);
    const [link] = (await parent.get('/api/parent/links')).body.links;
    expect(link.status).toBe('pending_student');

    // The admin can't approve before the student confirms, and a parent can't approve at all.
    const admin = await as('admin@tutorstogo.ph');
    expect((await admin.post(`/api/admin/parent-links/${link.id}`).send({ approve: true })).status).toBe(409);
    expect((await parent.post(`/api/admin/parent-links/${link.id}`).send({ approve: true })).status).toBe(403);
    // Only the requested student can answer.
    const other = await as('miguel@student.ph');
    expect((await other.post(`/api/student/parent-links/${link.id}`).send({ accept: true })).status).toBe(404);

    const bea = await as('bea@student.ph');
    const requests = (await bea.get('/api/student/parent-links')).body.links;
    expect(requests.map((l: { parent: { name: string } }) => l.parent.name)).toEqual(expect.arrayContaining(['Test Parent', 'Ramon Santos', 'Liza Santos']));
    expect((await bea.post(`/api/student/parent-links/${link.id}`).send({ accept: false })).status).toBe(200);
    expect((await parent.get('/api/parent/links')).body.links[0]).toMatchObject({ status: 'declined', declinedBy: 'student' });

    // After a decline the parent can ask again.
    expect((await parent.post('/api/parent/links').send({ email: 'bea@student.ph' })).status).toBe(201);
    const again = (await parent.get('/api/parent/links')).body.links.find((l: { status: string }) => l.status === 'pending_student');
    expect((await bea.post(`/api/student/parent-links/${again.id}`).send({ accept: true })).status).toBe(200);
    expect((await parent.get('/api/parent/progress')).body.child).toBeNull();
    expect((await admin.post(`/api/admin/parent-links/${again.id}`).send({ approve: true })).status).toBe(200);
    const progress = (await parent.get('/api/parent/progress')).body;
    expect(progress.child.id).toBe('s_bea');
    expect(progress.sessions.length).toBeGreaterThan(0);
  });

  it('lets a parent follow more than one child', async () => {
    const liza = await as('liza@parent.ph');
    expect((await liza.get('/api/parent/progress')).body.children.map((c: { id: string }) => c.id)).toEqual(['s_bea']);
    expect((await liza.get('/api/parent/progress?child=s_miguel')).status).toBe(404);
    const admin = await as('admin@tutorstogo.ph');
    const queue = (await admin.get('/api/admin/parent-links')).body.links.filter((l: { status: string }) => l.status === 'pending_admin');
    const miguel = queue.find((l: { student: { id: string } }) => l.student.id === 's_miguel');
    expect((await admin.post(`/api/admin/parent-links/${miguel.id}`).send({ approve: true })).status).toBe(200);
    expect((await liza.get('/api/parent/progress')).body.children.map((c: { id: string }) => c.id).sort()).toEqual(['s_bea', 's_miguel']);
    expect((await liza.get('/api/parent/progress?child=s_miguel')).body.child.name).toBe('Miguel Santos');
  });
});

describe('warnings', () => {
  it('shows users their warnings and bans the account at three', async () => {
    const admin = await as('admin@tutorstogo.ph');
    const target = (await admin.get('/api/admin/users?role=student')).body.users.find((u: { id: string; status: string; warnings: number }) => u.status === 'active' && !u.warnings && u.id !== 's_bea');
    const student = await as(target.email);
    expect((await student.get('/api/me/warnings')).body).toMatchObject({ limit: 3, active: 0, warnings: [] });
    expect((await admin.post(`/api/admin/users/${target.id}/warnings`).send({ reason: 'no' })).status).toBe(400);
    expect((await student.post(`/api/admin/users/${target.id}/warnings`).send({ reason: 'Self-warning attempt' })).status).toBe(403);

    const first = await admin.post(`/api/admin/users/${target.id}/warnings`).send({ reason: 'Rude comment in a study group.' });
    expect(first.body).toMatchObject({ count: 1, banned: false });
    const mine = (await student.get('/api/me/warnings')).body;
    expect(mine.active).toBe(1);
    expect(mine.warnings[0].reason).toBe('Rude comment in a study group.');
    expect(mine.warnings[0].issuedBy).toBeUndefined();

    const second = (await admin.post(`/api/admin/users/${target.id}/warnings`).send({ reason: 'Spam posts in a study group.' })).body;
    expect(second.count).toBe(2);
    // A removed warning stays on record but no longer counts.
    const newest = (await admin.get(`/api/admin/users/${target.id}/warnings`)).body.warnings[0];
    expect((await admin.post(`/api/admin/warnings/${newest.id}/remove`)).body.active).toBe(1);
    expect((await student.get('/api/me/warnings')).body).toMatchObject({ active: 1, warnings: [{ active: false }, { active: true }] });
    await admin.post(`/api/admin/users/${target.id}/warnings`).send({ reason: 'Shared a classmate’s phone number.' });
    const third = (await admin.post(`/api/admin/users/${target.id}/warnings`).send({ reason: 'Harassed a tutor in messages.' })).body;
    expect(third).toMatchObject({ count: 3, banned: true });

    // Banned: signed out everywhere and can't sign back in.
    expect((await student.get('/api/me/warnings')).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: 'demo123' });
    expect(login.status).toBe(403);
    expect(login.body.error).toMatch(/banned/);
    const row = (await admin.get(`/api/admin/users?q=${encodeURIComponent(target.email)}`)).body.users[0];
    expect(row).toMatchObject({ status: 'banned', warnings: 3 });
    const overview = (await admin.get('/api/admin/overview')).body.counts;
    expect(overview.warningsSent).toBeGreaterThanOrEqual(4);
    expect(overview.banned).toBeGreaterThanOrEqual(1);

    // Lifting the ban lets them back in.
    expect((await admin.post(`/api/admin/users/${target.id}/status`).send({ status: 'active' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: target.email, password: 'demo123' })).status).toBe(200);
  });

  it('shows the demo tutor the warning an admin sent', async () => {
    const paolo = await as('paolo.reyes@tutor.ph');
    expect((await paolo.get('/api/me/warnings')).body).toMatchObject({ active: 1, limit: 3 });
  });
});

describe('license and rate tiers', () => {
  const tutorSignup = (email: string, tutor: object) => ({
    role: 'teacher', name: 'Tier Tutor', email, password: 'secret1', acceptTerms: true,
    profile: { hobbies: ['Coding', 'Anime', 'Music'], learning: 'Visual', social: 0.3, approach: 0.8, subjects: ['Programming'], sched: ['Weekday evenings'], grades: ['Senior High'] },
    tutor: { method: "4A's lesson plan", curricula: [], ...tutor },
  });

  it('lets non-licensed tutors apply within their band and with a diploma instead of a PRC license', async () => {
    expect((await request(app).post('/api/auth/signup').send(tutorSignup('nl1@example.com', { licenseType: 'non_licensed', rate: 300, years: 1 }))).body.error).toMatch(/eligibility/);
    expect((await request(app).post('/api/auth/signup').send(tutorSignup('nl2@example.com', { licenseType: 'non_licensed', eligibility: 'student', rate: 500, years: 1 }))).body.error).toMatch(/₱150–₱350/);
    const agent = request.agent(app);
    const ok = await agent.post('/api/auth/signup').send(tutorSignup('nl3@example.com', { licenseType: 'non_licensed', eligibility: 'student', rate: 250, years: 1 }));
    expect(ok.status).toBe(201);
    expect(ok.body.me.tutor).toMatchObject({ licenseType: 'non_licensed', eligibility: 'student', rate: 250 });

    // Non-licensed applicants send a diploma or enrollment certificate, not a PRC license.
    const missing = await agent.post('/api/me/application').field('video', 'https://youtu.be/demo')
      .attach('prc', PDF, { filename: 'prc.pdf', contentType: 'application/pdf' })
      .attach('birth', PDF, { filename: 'psa.pdf', contentType: 'application/pdf' })
      .attach('tor', PDF, { filename: 'tor.pdf', contentType: 'application/pdf' });
    expect(missing.body.error).toMatch(/Diploma or certificate of enrollment/);
    const sent = await agent.post('/api/me/application').field('video', 'https://youtu.be/demo')
      .attach('diploma', PDF, { filename: 'coe.pdf', contentType: 'application/pdf' })
      .attach('birth', PDF, { filename: 'psa.pdf', contentType: 'application/pdf' })
      .attach('tor', PDF, { filename: 'tor.pdf', contentType: 'application/pdf' });
    expect(sent.status).toBe(200);
    const admin = await as('admin@tutorstogo.ph');
    const detail = (await admin.get(`/api/admin/applications/${ok.body.me.id}`)).body.application;
    expect(detail.docs.map((d: { kind: string }) => d.kind).sort()).toEqual(['birth', 'diploma', 'tor']);
  });

  it('keeps licensed tutors inside their band and moves them up after five years', async () => {
    expect((await request(app).post('/api/auth/signup').send(tutorSignup('lic1@example.com', { rate: 900, years: 2 }))).body.error).toMatch(/₱300–₱700/);
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/signup').send(tutorSignup('lic2@example.com', { rate: 900, years: 6 }))).status).toBe(201);
    const me = (await agent.get('/api/auth/me')).body.me;
    const update = (tutor: object) => agent.put('/api/me/profile').send({ name: me.name, profile: me.profile, tutor: { ...me.tutor, ...tutor } });
    expect((await update({ rate: 1500 })).body.error).toMatch(/₱400–₱1,200/);
    // A tutor can't switch their own license type from the profile form.
    expect((await update({ rate: 300, licenseType: 'non_licensed', eligibility: 'degree' })).body.error).toMatch(/₱400–₱1,200/);
    expect((await update({ rate: 1100 })).status).toBe(200);
  });

  it('seeds every tutor inside their rate band and lets students filter by license', async () => {
    const bea = await as('bea@student.ph');
    const all = (await bea.get('/api/tutors')).body.tutors as { licenseType: string; rate: number; years: number }[];
    expect(all.some((t) => t.licenseType === 'non_licensed')).toBe(true);
    for (const t of all) expect(rateError(t.licenseType as 'licensed', t.years, t.rate)).toBeNull();
    const nl = (await bea.get('/api/tutors?license=non_licensed')).body.tutors as { licenseType: string }[];
    expect(nl.length).toBeGreaterThan(0);
    expect(nl.every((t) => t.licenseType === 'non_licensed')).toBe(true);
  });
});

describe('admin settings', () => {
  it('changes the live model', async () => {
    const admin = await as('admin@tutorstogo.ph');
    const r = await admin.put('/api/admin/settings').send({ k: 5, seed: 7, init: 'kmeans++', approach: 'joint' });
    expect(r.status).toBe(200);
    const o = await admin.get('/api/admin/overview');
    expect(o.body.model.k).toBe(5);
  });
});
