/** Shapes of API responses the screens render. */
import type { Profile, Settings } from '../../shared/types';
import type { ReviewView, SessionView } from './labels';

export type { ReviewView, SessionView };

export interface TutorCard {
  id: string;
  name: string;
  headline: string;
  subjects: string[];
  levels: string[];
  rate: number;
  years: number;
  avg: number;
  count: number;
  pct: number;
  d: number;
  cluster: number;
  sharedHobbies: string[];
  why: string;
  blocks: { label: string; sim: number }[];
}

export interface ClusterSummary { no: number; name: string; count: number }

export interface StudentHome {
  next: SessionView | null;
  moreUp: number;
  cluster: ClusterSummary | null;
  stats: { completed: number; hours: number; pending: number; groups: number; invites: number };
  top: TutorCard[];
  toRate: SessionView[];
}

export interface MatchesResponse {
  reason?: 'no_tutors' | 'profile_required';
  matches: null | { cluster: ClusterSummary; settings: Settings; inCluster: TutorCard[]; others: TutorCard[] };
}

export interface TutorStats { avg: number; count: number; dist: number[] }

export interface TutorProfileResponse {
  tutor: {
    id: string;
    name: string;
    headline: string;
    bio: string;
    rate: number;
    years: number;
    education: string;
    curricula: string[];
    method: string;
    profile: Profile;
    slots: string[];
  };
  stats: TutorStats;
  reviews: ReviewView[];
  match: null | { pct: number; cluster: number; yourCluster: boolean; why: string; blocks: { label: string; sim: number }[]; sharedHobbies: string[] };
}

export interface ApplicationView {
  status: import('../../shared/types').AppStatus;
  note: string;
  video: string;
  submittedAt: string | null;
  docs: Record<string, { fileName: string; fileId: string | null }>;
  history: { status: string; at: string; note: string }[];
}
