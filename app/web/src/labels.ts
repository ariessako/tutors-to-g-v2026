import type { AppStatus, LinkStatus, PaymentStatus, ReviewStatus, SessionStatus } from '../../shared/types';
import type { Tone } from './ui';

export type { SessionView, ReviewView } from '../../server/views';

export const PAYMENT: Record<PaymentStatus, { label: string; tone: Tone; icon: string }> = {
  unpaid: { label: 'Unpaid', tone: 'neutral', icon: 'circle-dashed' },
  for_review: { label: 'Receipt under review', tone: 'warn', icon: 'hourglass' },
  paid: { label: 'Paid', tone: 'ok', icon: 'check-circle' },
  rejected: { label: 'Payment rejected', tone: 'bad', icon: 'x-circle' },
};

export const SESSION: Record<SessionStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Awaiting tutor', tone: 'neutral' },
  accepted: { label: 'Accepted', tone: 'info' },
  declined: { label: 'Declined', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'ok' },
};

export const APPLICATION: Record<AppStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Not submitted', tone: 'neutral' },
  pending: { label: 'Pending review', tone: 'warn' },
  needs_changes: { label: 'Changes requested', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'neutral' },
};

export const REVIEW: Record<ReviewStatus, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'warn' },
  reviewed: { label: 'Reviewed', tone: 'neutral' },
  action: { label: 'Action taken', tone: 'info' },
};

export const LINK: Record<LinkStatus, { label: string; tone: Tone }> = {
  pending_student: { label: 'Waiting for student', tone: 'warn' },
  pending_admin: { label: 'Waiting for admin', tone: 'warn' },
  approved: { label: 'Linked', tone: 'ok' },
  declined: { label: 'Declined', tone: 'neutral' },
};

/** A parent link as the API returns it. */
export interface LinkView {
  id: string;
  parent: { id: string; name: string; email: string; gradeLabel: string | null };
  student: { id: string; name: string; email: string; gradeLabel: string | null };
  status: LinkStatus;
  declinedBy: 'student' | 'admin' | null;
  requestedAt: string;
  studentAt: string | null;
  adminAt: string | null;
}

export const ROLE_LABEL = { student: 'Student', teacher: 'Tutor', parent: 'Parent / guardian', admin: 'Admin' } as const;
