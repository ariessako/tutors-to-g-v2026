/** Types shared by the API server and the web client. */

export type Role = 'student' | 'teacher' | 'parent' | 'admin';
export type UserStatus = 'active' | 'deactivated';
export type AppStatus = 'draft' | 'pending' | 'needs_changes' | 'approved' | 'rejected';
export type SessionStatus = 'pending' | 'accepted' | 'declined' | 'completed';
export type PaymentStatus = 'unpaid' | 'for_review' | 'paid' | 'rejected';
export type ReviewStatus = 'new' | 'reviewed' | 'action';

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
}

export interface TutorDetails {
  headline: string;
  rate: number;
  years: number;
  education: string;
  curricula: string[];
  method: string;
  bio: string;
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
  childId: string | null;
  profile: Profile | null;
  tutor: (TutorDetails & { slots: string[]; appStatus: AppStatus }) | null;
}
