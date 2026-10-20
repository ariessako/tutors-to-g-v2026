/** Shapes database rows into the JSON the web client renders. */
import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db';
import { applications, reviews, sessionEvents, tutoringSessions, users } from './db/schema';
import type { User } from './auth';
import type { Me } from '../shared/types';
import { sortSlots } from '../shared/format';

type SessionRow = typeof tutoringSessions.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;

export function meDto(db: Db, u: User): Me {
  let tutor: Me['tutor'] = null;
  if (u.role === 'teacher') {
    const app = db.select({ status: applications.status }).from(applications).where(eq(applications.userId, u.id)).get();
    tutor = {
      licenseType: u.licenseType ?? 'licensed',
      eligibility: u.eligibility ?? null,
      headline: u.headline ?? '',
      rate: u.rate ?? 0,
      years: u.years ?? 0,
      education: u.education ?? '',
      curricula: u.curricula ?? [],
      method: u.method ?? '',
      bio: u.bio ?? '',
      slots: sortSlots(u.slots ?? []),
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
  const ids = rows.map((r) => r.id);
  const events = ids.length ? db.select().from(sessionEvents).where(inArray(sessionEvents.sessionId, ids)).all() : [];
  const who = nameMap(db, [...rows.flatMap((r) => [r.studentId, r.tutorId]), ...events.map((e) => e.actorId)]);
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
    declineReason: r.declineReason,
    amount: r.amount,
    rated: r.rated,
    log: r.completedAt
      ? { attendance: r.attendance, actualHours: r.actualHours, topics: r.topicsCovered ?? '', notes: r.sessionNotes ?? '', completedAt: r.completedAt }
      : null,
    events: events
      .filter((e) => e.sessionId === r.id)
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id))
      .map((e) => ({ at: e.at, kind: e.kind, by: e.actorId ? who(e.actorId).name : null, detail: e.detail })),
    payment: {
      status: r.paymentStatus,
      reference: r.paymentRef,
      receiptName: r.receiptName,
      receiptFileId: r.receiptFileId,
      amountPaid: r.amountPaid,
      at: r.receiptAt,
    },
  }));
}
export type SessionView = ReturnType<typeof sessionViews>[number];

/**
 * Reviews as other users see them. Every review is anonymous: the comment is
 * shown but the author is withheld unless `revealAuthors` (admins, or the
 * author reading their own reviews).
 */
export function reviewViews(db: Db, rows: ReviewRow[], revealAuthors = false) {
  const who = nameMap(db, rows.flatMap((r) => [r.authorId, r.tutorId]));
  return rows.map((r) => {
    const hide = !revealAuthors;
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
      criteria: r.criteria ?? null,
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
