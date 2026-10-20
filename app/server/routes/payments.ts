import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { payments, tutoringSessions } from '../db/schema';
import { HttpError, requireUser } from '../auth';
import type { Ctx } from '../context';
import { mockPdf } from '../mockPdf';
import { paymentState, receiptsFor } from '../payments';
import { childIdsOf } from '../services';
import { nameMap } from '../views';
import { fmtDate } from '../../shared/format';

export function paymentRoutes(ctx: Ctx) {
  const { db } = ctx;
  const r = Router();

  /**
   * An acknowledgment that Tutors To Go received an approved payment. The
   * student, their linked parents, the tutor and admins can download it.
   */
  r.get('/payments/:id/acknowledgment.pdf', (req, res) => {
    const me = requireUser(req);
    const row = db.select({ p: payments, s: tutoringSessions }).from(payments).innerJoin(tutoringSessions, eq(tutoringSessions.id, payments.sessionId)).where(eq(payments.id, req.params.id)).get();
    const allowed = row && (me.role === 'admin' || row.s.studentId === me.id || row.s.tutorId === me.id || (me.role === 'parent' && childIdsOf(db, me.id).includes(row.s.studentId)));
    if (!row || !allowed) throw new HttpError(404, 'Payment not found.');
    const { p, s } = row;
    if (p.status !== 'approved') throw new HttpError(409, 'An acknowledgment is available once an admin confirms the payment.');
    const state = paymentState(s, receiptsFor(db, s.id));
    const who = nameMap(db, [s.studentId, s.tutorId]);
    const peso = (n: number) => `PHP ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const lines = [
      `Acknowledgment no.: ${p.id.toUpperCase()}`,
      `Received from: ${s.learner || who(s.studentId).name}`,
      `Amount received: ${peso(p.amount)}${s.planParts > 1 ? ` (installment ${p.part} of up to ${s.planParts})` : ''}`,
      `Date confirmed: ${p.reviewedAt ? fmtDate(p.reviewedAt.slice(0, 10)) : '-'}`,
      `For: ${s.subject} with ${who(s.tutorId).name}, ${fmtDate(s.date)} (${s.slot.split(' ')[1]}, ${s.hours} hr)`,
      `Payment reference: ${p.reference ?? '-'}`,
      `Session total: ${peso(s.amount)}   Paid so far: ${peso(state.paid)}   Balance: ${peso(state.balance)}`,
    ];
    const pdf = mockPdf('Payment acknowledgment', lines, 'Tutors To Go confirms receipt of this payment. Keep this for your records.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tutors-to-go-acknowledgment-${p.id}.pdf"`);
    res.send(pdf);
  });

  return r;
}
