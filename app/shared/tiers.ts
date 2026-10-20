/**
 * Tutor qualification tiers and the hourly rate band each one may charge.
 *
 * There is no official tutor tariff in the Philippines. The bands follow
 * published private-tutoring rates (2025-26): roughly ₱300-₱1,000 an hour
 * overall, ₱350-₱500 typical for licensed professional teachers and up to
 * ₱1,200 for experienced specialists, with non-licensed tutors (college
 * students, degree holders) at the lower end. Revisit the numbers yearly.
 */

export type LicenseType = 'licensed' | 'non_licensed';
/** Why a non-licensed tutor is eligible. */
export type Eligibility = 'degree' | 'student';
export type Tier = 'non_licensed' | 'licensed' | 'licensed_senior';

/** Years of teaching from which a licensed tutor moves to the senior band. */
export const SENIOR_YEARS = 5;

export const RATE_TIERS: Record<Tier, { label: string; min: number; max: number; who: string }> = {
  non_licensed: { label: 'Non-licensed tutor', min: 150, max: 350, who: 'College graduates and college students who meet the eligibility rules' },
  licensed: { label: 'Licensed teacher (LPT)', min: 300, max: 700, who: `PRC-licensed professional teachers with under ${SENIOR_YEARS} years of teaching` },
  licensed_senior: { label: `Licensed teacher, ${SENIOR_YEARS}+ years`, min: 400, max: 1200, who: `PRC-licensed professional teachers with ${SENIOR_YEARS} or more years of teaching` },
};

export const LICENSE_LABEL: Record<LicenseType, string> = { licensed: 'Licensed (LPT)', non_licensed: 'Non-licensed' };

export const ELIGIBILITY: Record<Eligibility, { label: string; proof: string }> = {
  degree: { label: 'College graduate', proof: 'Diploma, with the transcript of records' },
  student: { label: 'Current college student with a grade of 2.0 or better in the subject', proof: 'Certificate of enrollment, with a transcript showing the grade' },
};

export const tierFor = (license: LicenseType | null | undefined, years: number): Tier =>
  license === 'non_licensed' ? 'non_licensed' : years >= SENIOR_YEARS ? 'licensed_senior' : 'licensed';

/** Why a rate isn't allowed for this tutor, or null when it is. */
export function rateError(license: LicenseType | null | undefined, years: number, rate: number): string | null {
  const t = RATE_TIERS[tierFor(license, years)];
  if (rate < t.min || rate > t.max) return `${t.label}s can charge ₱${t.min.toLocaleString('en-US')}–₱${t.max.toLocaleString('en-US')} per hour.`;
  return null;
}

/** Keeps a rate inside the tutor's band. */
export function clampRate(license: LicenseType | null | undefined, years: number, rate: number) {
  const t = RATE_TIERS[tierFor(license, years)];
  return Math.min(t.max, Math.max(t.min, rate));
}
