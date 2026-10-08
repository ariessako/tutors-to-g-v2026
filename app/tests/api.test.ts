import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../server/db';
import { createApp } from '../server/app';
import { seedDemo } from '../server/seed';

let app: ReturnType<typeof createApp>['app'];
let uploads: string;
const PDF = Buffer.from('%PDF-1.4\n%test\n');

beforeAll(async () => {
  uploads = mkdtempSync(join(tmpdir(), 'ttg-test-'));
  const db = openDb(':memory:');
  await seedDemo(db);
  app = createApp({ db, uploadsDir: uploads, demo: true }).app;
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
    const slot = booking.body.slots[0];
    const req = await bea.post('/api/sessions').send({ tutorId: 't_paolo', subject: 'Math', date: slot.date, slot: slot.slot, hours: 1, mode: 'In-person', topic: 'Trigonometry basics' });
    expect(req.status).toBe(201);
    // Students can request the same slot; the instructor can only confirm one.
    const dup = await bea.post('/api/sessions').send({ tutorId: 't_paolo', subject: 'Math', date: slot.date, slot: slot.slot, hours: 1, mode: 'In-person', topic: 'Trigonometry basics' });
    expect(dup.status).toBe(201);

    // Paying before the tutor accepts is refused.
    const early = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('txn', 'ABCDEFGH12').field('amount', '450').attach('receipt', PDF, { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(early.status).toBe(409);

    const paolo = await as('paolo.reyes@tutor.ph');
    expect((await paolo.post(`/api/sessions/${req.body.id}/respond`).send({ accept: true })).status).toBe(200);
    expect((await paolo.post(`/api/sessions/${dup.body.id}/respond`).send({ accept: true })).status).toBe(409);

    const pay = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('txn', 'ABCDEFGH12').field('amount', '450').attach('receipt', PDF, { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(pay.status).toBe(200);

    const studentPending = await bea.get('/api/sessions');
    const pending = studentPending.body.sessions.find((s: { id: string }) => s.id === req.body.id);
    expect(pending.payment.status).toBe('for_review');
    const tutorPending = await paolo.get('/api/sessions');
    expect(tutorPending.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('for_review');
    const duplicateReceipt = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('txn', 'ABCDEFGH12').field('amount', '450').attach('receipt', PDF, { filename: 'duplicate.pdf', contentType: 'application/pdf' });
    expect(duplicateReceipt.status).toBe(409);
    expect((await bea.post(`/api/admin/payments/${req.body.id}`).send({ approve: true })).status).toBe(403);

    const admin = await as('admin@tutorstogo.ph');
    const pays = await admin.get('/api/admin/payments');
    const row = pays.body.payments.find((p: { id: string }) => p.id === req.body.id);
    expect(row.status).toBe('for_review');
    expect((await admin.get(`/api/files/${row.receiptFileId}`)).status).toBe(200);
    expect((await bea.get(`/api/files/${row.receiptFileId}`)).status).toBe(200);
    expect((await paolo.get(`/api/files/${row.receiptFileId}`)).status).toBe(404);

    expect((await admin.post(`/api/admin/payments/${req.body.id}`).send({ approve: false })).status).toBe(200);
    const rejected = await bea.get('/api/sessions');
    expect(rejected.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('rejected');
    const resubmit = await bea.post(`/api/sessions/${req.body.id}/receipt`).field('txn', 'CORRECTED123').field('amount', '450').attach('receipt', PDF, { filename: 'corrected.pdf', contentType: 'application/pdf' });
    expect(resubmit.status).toBe(200);
    const updatedPays = await admin.get('/api/admin/payments');
    const updatedRow = updatedPays.body.payments.find((p: { id: string }) => p.id === req.body.id);
    expect(updatedRow.status).toBe('for_review');
    expect(updatedRow.txn).toBe('CORRECTED123');
    expect(updatedRow.receiptName).toBe('corrected.pdf');
    expect(updatedRow.receiptFileId).not.toBe(row.receiptFileId);
    expect((await admin.get(`/api/files/${updatedRow.receiptFileId}`)).status).toBe(200);

    expect((await admin.post(`/api/admin/payments/${req.body.id}`).send({ approve: true })).status).toBe(200);
    const mine = await paolo.get('/api/sessions');
    expect(mine.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('paid');
    const studentPaid = await bea.get('/api/sessions');
    expect(studentPaid.body.sessions.find((s: { id: string }) => s.id === req.body.id).payment.status).toBe('paid');
    expect((await admin.post(`/api/admin/payments/${req.body.id}`).send({ approve: true })).status).toBe(409);
  });

  it('rejects non-PDF, non-image uploads', async () => {
    const bea = await as('bea@student.ph');
    const s = (await bea.get('/api/sessions')).body.sessions.find((x: { status: string; payment: { status: string } }) => x.status === 'accepted' && x.payment.status === 'unpaid');
    const r = await bea.post(`/api/sessions/${s.id}/receipt`).field('txn', 'ABCDEFGH12').field('amount', '675').attach('receipt', Buffer.from('hi'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(r.status).toBe(400);
  });
});

describe('tutor application', () => {
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

describe('admin settings', () => {
  it('changes the live model', async () => {
    const admin = await as('admin@tutorstogo.ph');
    const r = await admin.put('/api/admin/settings').send({ k: 5, seed: 7, init: 'kmeans++', approach: 'joint' });
    expect(r.status).toBe(200);
    const o = await admin.get('/api/admin/overview');
    expect(o.body.model.k).toBe(5);
  });
});
