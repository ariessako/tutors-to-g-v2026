import type { AppStatus, PaymentStatus, ReviewStatus, SessionStatus } from '../../shared/types';
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

export const ROLE_LABEL = { student: 'Student', teacher: 'Tutor', parent: 'Parent / guardian', admin: 'Admin' } as const;
