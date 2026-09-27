/** Shapes database rows into the JSON the web client renders. */
import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db';
import { applications, reviews, tutoringSessions, users } from './db/schema';
import type { User } from './auth';
import type { Me } from '../shared/types';

type SessionRow = typeof tutoringSessions.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;

export function meDto(db: Db, u: User): Me {
  let tutor: Me['tutor'] = null;
  if (u.role === 'teacher') {
    const app = db.select({ status: applications.status }).from(applications).where(eq(applications.userId, u.id)).get();
    tutor = {
      headline: u.headline ?? '',
      rate: u.rate ?? 0,
      years: u.years ?? 0,
      education: u.education ?? '',
      curricula: u.curricula ?? [],
      method: u.method ?? '',
      bio: u.bio ?? '',
      slots: u.slots ?? [],
      appStatus: app?.status ?? 'draft',
    };
  }
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    gradeLabel: u.gradeLabel,
    school: u.school,
    childId: u.childId,
    profile: u.profile,
    tutor,
  };
}

/** id → { name, role } for a set of user ids. Deleted users come back as "Former user". */
export function nameMap(db: Db, ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = want.length
    ? db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, want)).all()
    : [];
  const map = new Map(rows.map((r) => [r.id, r]));
  return (id: string | null | undefined) => (id && map.get(id)) || { id: id ?? '', name: 'Former user', role: null };
}

export function sessionViews(db: Db, rows: SessionRow[]) {
  const who = nameMap(db, rows.flatMap((r) => [r.studentId, r.tutorId]));
  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    tutorId: r.tutorId,
    student: who(r.studentId).name,
    tutor: who(r.tutorId).name,
    subject: r.subject,
    date: r.date,
    slot: r.slot,
    time: r.slot.split(' ')[1],
    hours: r.hours,
    mode: r.mode,
    topic: r.topic,
    learner: r.learner || who(r.studentId).name,
    guardian: r.guardian,
    status: r.status,
    amount: r.amount,
    rated: r.rated,
    payment: {
      status: r.paymentStatus,
      txn: r.paymentTxn,
      receiptName: r.receiptName,
      receiptFileId: r.receiptFileId,
      amountPaid: r.amountPaid,
      at: r.receiptAt,
    },
  }));
}
export type SessionView = ReturnType<typeof sessionViews>[number];

/**
 * Reviews as other users see them. The author of an anonymous review is
 * withheld unless `revealAuthors` (admins only).
 */
export function reviewViews(db: Db, rows: ReviewRow[], revealAuthors = false) {
  const who = nameMap(db, rows.flatMap((r) => [r.authorId, r.tutorId]));
  return rows.map((r) => {
    const hide = r.anonymous && !revealAuthors;
    const author = hide ? null : who(r.authorId).name;
    return {
      id: r.id,
      tutorId: r.tutorId,
      tutor: who(r.tutorId).name,
      authorId: hide ? null : r.authorId,
      author,
      authorRole: r.authorRole,
      by: hide
        ? `Anonymous ${r.authorRole === 'parent' ? 'parent' : 'student'}`
        : `${author}${r.authorRole === 'parent' ? ' (parent)' : ''}`,
      rating: r.rating,
      comment: r.comment,
      anonymous: r.anonymous,
      date: r.date,
      hidden: r.hidden,
      status: r.status,
      note: r.note,
    };
  });
}
export type ReviewView = ReturnType<typeof reviewViews>[number];
