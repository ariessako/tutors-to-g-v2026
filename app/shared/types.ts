/** Types shared by the API server and the web client. */

export type Role = 'student' | 'teacher' | 'parent' | 'admin';
/** `banned`: reached the warning limit (or banned by an admin); can't sign in until an admin lifts it. */
export type UserStatus = 'active' | 'deactivated' | 'banned';
export type AppStatus = 'draft' | 'pending' | 'needs_changes' | 'approved' | 'rejected';
export type SessionStatus = 'pending' | 'accepted' | 'declined' | 'completed';
export type LinkStatus = 'pending_student' | 'pending_admin' | 'approved' | 'declined';
/** A session's overall payment state, derived from its receipts. `partial`: some installments received, balance left. */
export type PaymentStatus = 'unpaid' | 'for_review' | 'partial' | 'paid' | 'rejected';
/** One uploaded receipt (a full payment or one installment). */
export type ReceiptStatus = 'for_review' | 'approved' | 'rejected';
export type Attendance = 'present' | 'late' | 'no_show';
/** Things that happen to a session, logged in order for its timeline. */
export type SessionEventKind =
  | 'requested' | 'accepted' | 'declined' | 'auto_declined' | 'receipt_uploaded' | 'payment_approved' | 'payment_rejected' | 'completed';
export type ReviewStatus = 'new' | 'reviewed' | 'action';

import type { Eligibility, LicenseType } from './tiers';

/** The matching profile: everything k-means sees about a person. */
export interface Profile {
  hobbies: string[];
  learning: string;
  /** 0 = introvert, 1 = extrovert. */
  social: number;
  /** 0 = structured, 1 = exploratory. */
  approach: number;
  subjects: string[];
  sched: string[];
  grades: string[];
  /** Free-text interests that aren't in the hobby list. Shown on profiles; matching doesn't use it. */
  interests?: string;
}

export interface TutorDetails {
  licenseType: LicenseType;
  /** Set for non-licensed tutors. */
  eligibility: Eligibility | null;
  headline: string;
  rate: number;
  years: number;
  education: string;
  curricula: string[];
  method: string;
  bio: string;
  /** Whether students may pay this tutor's sessions in parts, how many at most, and the smallest first part (% of the total). */
  allowInstallments: boolean;
  maxInstallments: number;
  minFirstPercent: number;
}

export interface Settings {
  k: number;
  seed: number;
  init: 'kmeans++' | 'random';
  approach: 'joint' | 'tutor';
}

/** The signed-in user, as returned by /api/auth/me. */
export interface Me {
  id: string;
  role: Role;
  name: string;
  email: string;
  gradeLabel: string | null;
  school: string | null;
  profile: Profile | null;
  tutor: (TutorDetails & { slots: string[]; appStatus: AppStatus }) | null;
}
