import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  AppStatus,
  PaymentStatus,
  Profile,
  ReviewStatus,
  Role,
  SessionStatus,
  UserStatus,
} from '../../shared/types';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  role: text('role').$type<Role>().notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  status: text('status').$type<UserStatus>().notNull().default('active'),
  joined: text('joined').notNull(),
  // Students
  gradeLabel: text('grade_label'),
  school: text('school'),
  parentId: text('parent_id'),
  // Parents
  childId: text('child_id'),
  // Students and tutors
  profile: text('profile', { mode: 'json' }).$type<Profile>(),
  // Tutors
  headline: text('headline'),
  bio: text('bio'),
  rate: integer('rate'),
  years: integer('years'),
  education: text('education'),
  curricula: text('curricula', { mode: 'json' }).$type<string[]>(),
  method: text('method'),
  slots: text('slots', { mode: 'json' }).$type<string[]>(),
});

export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
});

/** Uploaded files. Seeded demo records may reference a file name with no stored file. */
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  originalName: text('original_name').notNull(),
  storedName: text('stored_name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
});

/** One tutor application per tutor account. */
export const applications = sqliteTable('applications', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').$type<AppStatus>().notNull().default('draft'),
  submittedAt: text('submitted_at'),
  note: text('note').notNull().default(''),
  video: text('video'),
});

export const applicationDocs = sqliteTable(
  'application_docs',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    fileName: text('file_name').notNull(),
    fileId: text('file_id').references(() => files.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

export const applicationHistory = sqliteTable('application_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').$type<AppStatus>().notNull(),
  at: text('at').notNull(),
  note: text('note').notNull().default(''),
});

export const tutoringSessions = sqliteTable('tutoring_sessions', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tutorId: text('tutor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  date: text('date').notNull(),
  /** Weekly slot the session was booked from, e.g. "Tue 17:00". */
  slot: text('slot').notNull(),
  hours: real('hours').notNull(),
  mode: text('mode').notNull(),
  topic: text('topic').notNull(),
  learner: text('learner').notNull().default(''),
  guardian: text('guardian').notNull().default(''),
  status: text('status').$type<SessionStatus>().notNull().default('pending'),
  amount: real('amount').notNull(),
  /** Star rating the student gave for this session, 0 when not rated yet. */
  rated: integer('rated').notNull().default(0),
  createdAt: text('created_at').notNull(),
  paymentStatus: text('payment_status').$type<PaymentStatus>().notNull().default('unpaid'),
  paymentTxn: text('payment_txn'),
  receiptName: text('receipt_name'),
  receiptFileId: text('receipt_file_id').references(() => files.id, { onDelete: 'set null' }),
  amountPaid: real('amount_paid'),
  receiptAt: text('receipt_at'),
  reviewedAt: text('reviewed_at'),
});

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  tutorId: text('tutor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorRole: text('author_role').$type<'student' | 'parent'>().notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  anonymous: integer('anonymous', { mode: 'boolean' }).notNull().default(false),
  date: text('date').notNull(),
  status: text('status').$type<ReviewStatus>().notNull().default('new'),
  hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
  note: text('note').notNull().default(''),
  sessionId: text('session_id').references(() => tutoringSessions.id, { onDelete: 'set null' }),
});

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  subject: text('subject').notNull(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
});

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: text('joined_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const groupInvites = sqliteTable(
  'group_invites',
  {
    groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  at: text('at').notNull(),
  text: text('text').notNull(),
});

/** Single row (id = 1) holding the live matching model settings. */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  k: integer('k').notNull(),
  seed: integer('seed').notNull(),
  init: text('init').$type<'kmeans++' | 'random'>().notNull(),
  approach: text('approach').$type<'joint' | 'tutor'>().notNull(),
});
