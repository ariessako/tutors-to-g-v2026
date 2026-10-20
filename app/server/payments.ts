/**
 * Payment rules. A session is paid by one receipt (pay in full) or, when the
 * tutor allowed it at booking time, by up to `planParts` installments. Each
 * receipt is approved or rejected by an admin; the session's paymentStatus is
 * always derived from its receipts.
 */
import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { payments, tutoringSessions } from './db/schema';
import type { PaymentStatus } from '../shared/types';
import { addDays, iso, parseIso } from '../shared/format';

type Session = typeof tutoringSessions.$inferSelect;
type Receipt = typeof payments.$inferSelect;
type Tx = Pick<Db, 'select' | 'update'>;

const peso = (n: number) => Math.round(n * 100) / 100;

/**
 * When each part is due and a suggested amount: the first part on the session
 * date at the tutor's minimum percentage, each later one `planIntervalDays`
 * after the previous with the rest split evenly. A full payment is one part
 * due on the session date.
 */
export function paymentSchedule(s: Pick<Session, 'amount' | 'date' | 'planParts' | 'planMinFirstPct' | 'planIntervalDays'>) {
  const n = Math.max(1, s.planParts);
  const first = n === 1 ? s.amount : Math.ceil((s.amount * s.planMinFirstPct) / 100);
  const rest = Math.floor((s.amount - first) / Math.max(1, n - 1));
  return Array.from({ length: n }, (_, i) => ({
    part: i + 1,
    dueDate: iso(addDays(parseIso(s.date), i * s.planIntervalDays)),
    suggested: i === 0 ? first : i === n - 1 ? peso(s.amount - first - rest * (n - 2)) : rest,
  }));
}

export type ScheduleStatus = 'paid' | 'in_review' | 'due' | 'overdue' | 'upcoming' | 'not_needed';

export function paymentState(s: Pick<Session, 'amount' | 'date' | 'status' | 'planParts' | 'planMinFirstPct' | 'planIntervalDays'>, receipts: Receipt[], today = iso(new Date())) {
  const approved = receipts.filter((p) => p.status === 'approved');
  const pending = receipts.find((p) => p.status === 'for_review') ?? null;
  const paid = peso(approved.reduce((n, p) => n + p.amount, 0));
  const balance = peso(Math.max(0, s.amount - paid));
  const nextPart = approved.length + 1;
  const installments = s.planParts > 1;
  // The first part has a floor; the last allowed part must clear the balance.
  const minNext = !installments || nextPart >= s.planParts ? balance : nextPart === 1 ? Math.min(balance, Math.ceil((s.amount * s.planMinFirstPct) / 100)) : Math.min(balance, 1);
  const status: PaymentStatus = pending
    ? 'for_review'
    : balance <= 0 && approved.length
      ? 'paid'
      : paid > 0
        ? 'partial'
        : receipts.some((p) => p.status === 'rejected')
          ? 'rejected'
          : 'unpaid';
  const schedule = paymentSchedule(s).map((p) => ({
    ...p,
    status: (p.part <= approved.length
      ? 'paid'
      : balance <= 0
        ? 'not_needed'
        : p.part === nextPart
          ? pending ? 'in_review' : p.dueDate < today ? 'overdue' : 'due'
          : 'upcoming') as ScheduleStatus,
  }));
  // Only accepted or completed sessions owe anything; a request or a declined session has nothing due.
  const owed = s.status === 'accepted' || s.status === 'completed';
  const next = owed ? (schedule.find((p) => p.part === nextPart && balance > 0) ?? null) : null;
  return {
    status,
    paid,
    balance,
    nextPart,
    minNext,
    installments,
    schedule,
    /** Due date of the part to pay next, or null when nothing is owed. */
    nextDue: next?.dueDate ?? null,
    overdue: next?.status === 'overdue',
    canPay: (s.status === 'accepted' || s.status === 'completed') && !pending && balance > 0,
  };
}

export const receiptsFor = (db: Pick<Db, 'select'>, sessionId: string) =>
  db.select().from(payments).where(eq(payments.sessionId, sessionId)).all().sort((a, b) => a.part - b.part || (a.uploadedAt < b.uploadedAt ? -1 : 1));

/** Recomputes and stores a session's paymentStatus from its receipts. */
export function syncPaymentStatus(tx: Tx, sessionId: string) {
  const s = tx.select().from(tutoringSessions).where(eq(tutoringSessions.id, sessionId)).get();
  if (!s) return null;
  const state = paymentState(s, receiptsFor(tx, sessionId));
  tx.update(tutoringSessions).set({ paymentStatus: state.status }).where(eq(tutoringSessions.id, sessionId)).run();
  return state;
}

/** Why `amount` can't be paid now, or null when it can. */
export function amountError(state: ReturnType<typeof paymentState>, amount: number, full: boolean) {
  const fmt = (n: number) => `₱${n.toLocaleString('en-US')}`;
  if (amount > state.balance) return `The balance is ${fmt(state.balance)}. Enter that amount or less.`;
  if (full || !state.installments) return amount < state.balance ? `Paying in full means ${fmt(state.balance)}.` : null;
  if (amount < state.minNext) return state.minNext === state.balance ? `This is the last installment: pay the ${fmt(state.balance)} balance.` : `The first installment is at least ${fmt(state.minNext)}.`;
  return null;
}
