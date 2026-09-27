/** Fixed option lists used by profiles, matching and forms. */

export const HOBBIES = [
  'Basketball', 'Volleyball', 'Mobile games', 'Drawing', 'Music', 'K-drama',
  'Anime', 'Reading', 'Cooking', 'Dance', 'Coding', 'Hiking',
] as const;
export const LEARNING = ['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'] as const;
export const SUBJECTS = [
  'Math', 'Science', 'English', 'Filipino', 'Araling Panlipunan', 'Programming', 'Accounting',
] as const;
export const SCHED = ['Weekday mornings', 'Weekday afternoons', 'Weekday evenings', 'Weekends'] as const;
export const GRADES = ['Elementary', 'Junior High', 'Senior High', 'College'] as const;
export const CURRICULA = [
  'K–12 Basic Education', 'MATATAG Curriculum', 'SHS strands (STEM, ABM, HUMSS)', 'CHED college programs',
] as const;
export const METHODS = [
  "4A's lesson plan", "7E's inquiry model", 'Explicit instruction', 'Differentiated instruction', 'Spiral progression',
] as const;

/** Calendar days, Sunday first (matches Date#getDay). */
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** Week as shown in schedules, Monday first. */
export const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** Hours a tutor can open on the weekly schedule. */
export const SCHEDULE_HOURS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
] as const;

export const SESSION_HOURS = [1, 1.5, 2] as const;
export const SESSION_MODES = ['Online (Google Meet)', 'In-person'] as const;

export const DOC_KINDS = [
  { key: 'prc', label: 'PRC license', hint: 'Professional Regulation Commission ID or certificate, front and back' },
  { key: 'birth', label: 'PSA birth certificate', hint: 'Issued by the Philippine Statistics Authority' },
  { key: 'tor', label: 'Transcript of Records', hint: 'Official copy from your college or university' },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]['key'];

/** Where students send PayPal payments. Shown in the pay dialog. */
export const PAYPAL_PAYEE = 'payments@tutorstogo.ph';
