/**
 * Demo dataset, ported from the design's seed(): 40 approved tutors, four
 * applicants, 60 students, a parent and an admin, with sessions, reviews and
 * study groups. Dates are relative to the day the seed runs.
 */
import { sql } from 'drizzle-orm';
import type { Db } from './db';
import * as t from './db/schema';
import { hashPassword } from './auth';
import { DEFAULT_SETTINGS } from './services';
import { rng } from '../shared/matching';
import { addDays, iso, nextDate } from '../shared/format';
import { CURRICULA, HOBBIES, LEARNING, METHODS, SCHED, SUBJECTS } from '../shared/vocab';
import type { AppStatus, Profile } from '../shared/types';

export const DEMO_PASSWORD = 'demo123';

export const DEMO_ACCOUNTS = [
  { label: 'Student · Bea Santos', email: 'bea@student.ph' },
  { label: 'Tutor · Paolo Reyes', email: 'paolo.reyes@tutor.ph' },
  { label: 'Tutor applicant · Jen Dizon', email: 'jen@tutor.ph' },
  { label: 'Parent · Liza Santos', email: 'liza@parent.ph' },
  { label: 'Admin', email: 'admin@tutorstogo.ph' },
];

const EDU: Record<string, string> = {
  Math: 'BSEd Mathematics · Philippine Normal University',
  Science: 'BS Biology · UP Diliman',
  English: 'AB English Studies · Ateneo de Manila University',
  Filipino: 'BSEd Filipino · Polytechnic University of the Philippines',
  'Araling Panlipunan': 'BSEd Social Studies · Philippine Normal University',
  Programming: 'BS Computer Science · Mapúa University',
  Accounting: 'BS Accountancy · University of Santo Tomas',
};
const GOOD = [
  'Explains problems step by step until it finally clicks.',
  'We talk about our hobbies for a few minutes before every session, so I actually look forward to it.',
  'Very patient. My grades went up by the second quarter.',
  'Uses drawings and diagrams a lot, which helps me remember.',
  'Always prepared with worksheets that follow our DepEd modules.',
  'Made Science fun with experiments I could do at home.',
  'Gives good practice tests before periodical exams.',
  'Kind and approachable. My child opened up quickly.',
  "Clear and organized. The 4A's format makes every lesson easy to follow.",
  'Checks in on how I’m doing, not just on the lesson.',
];
const LOW = ['Sessions often started late and felt rushed.', 'Hard to follow — goes too fast and doesn’t check if I understood.'];

const ARCH = [
  { hobbies: ['Drawing', 'Music', 'K-drama', 'Anime'], learning: ['Visual'], social: 0.3, approach: 0.72, subjects: ['English', 'Filipino', 'Araling Panlipunan'], sched: ['Weekday afternoons', 'Weekends'], grades: ['Junior High', 'Senior High'] },
  { hobbies: ['Basketball', 'Volleyball', 'Dance', 'Hiking'], learning: ['Kinesthetic', 'Visual'], social: 0.8, approach: 0.5, subjects: ['Math', 'Science'], sched: ['Weekday evenings', 'Weekends'], grades: ['Junior High', 'Senior High'] },
  { hobbies: ['Mobile games', 'Coding', 'Anime', 'Music'], learning: ['Visual', 'Kinesthetic'], social: 0.32, approach: 0.82, subjects: ['Programming', 'Math', 'Science'], sched: ['Weekday evenings'], grades: ['Senior High', 'College'] },
  { hobbies: ['Reading', 'Cooking', 'K-drama', 'Music'], learning: ['Reading/Writing', 'Auditory'], social: 0.45, approach: 0.2, subjects: ['English', 'Accounting', 'Science'], sched: ['Weekday mornings', 'Weekday afternoons'], grades: ['Elementary', 'College'] },
];

const FIRST = ['Miguel', 'Andrea', 'Joshua', 'Kyla', 'Carlo', 'Nicole', 'Gabriel', 'Trisha', 'Rafael', 'Denise', 'Marco', 'Aira', 'Enzo', 'Camille', 'Luis', 'Hannah', 'Jericho', 'Sofia', 'Ivan', 'Mika', 'Nathan', 'Angela', 'Kristine', 'Paul', 'Janelle', 'Adrian', 'Bianca', 'Renz', 'Joanna', 'Mark', 'Czarina', 'Gio', 'Patricia', 'Vince', 'Ella', 'Faith', 'Kevin', 'Rhea', 'Tristan', 'Lara', 'Dominic', 'Clarisse', 'Harvey', 'Shane', 'Iya', 'Cedric', 'Alyssa', 'Francis', 'Pia', 'Jasper', 'Maxine', 'Noel', 'Kate', 'Arvin', 'Lian', 'Ronald', 'Cheska', 'Jude', 'Mae', 'Oliver'];
const LAST = ['Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Flores', 'Navarro', 'Dela Cruz', 'Gonzales', 'Lopez', 'Mercado', 'Pascual', 'Salazar', 'Tolentino', 'Soriano', 'Manalo', 'Domingo', 'Ocampo', 'Rivera', 'Valdez', 'Aguilar', 'Samonte', 'Lim', 'Tan', 'Jimenez', 'Fernandez'];
const GRADE_LABELS: Record<string, string[]> = {
  Elementary: ['Grade 5', 'Grade 6'],
  'Junior High': ['Grade 8', 'Grade 9', 'Grade 10'],
  'Senior High': ['Grade 11 STEM', 'Grade 12 ABM', 'Grade 11 HUMSS'],
  College: ['1st year BSIT', '2nd year BSA'],
};
const SCHOOLS = ['Rizal High School, Pasig', 'Quezon City Science HS', 'Manila Science HS', 'Makati High School', 'PUP Sta. Mesa', 'Marikina HS', 'Taguig Integrated School'];

type UserRow = typeof t.users.$inferInsert;

/** Wipes every table and inserts the demo dataset. */
export async function seedDemo(db: Db, today = new Date()) {
  const r = rng(2026);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const dayAgo = (n: number) => iso(addDays(today, -n));
  const stampAgo = (days: number, hour: number, minute = 0) => {
    const d = addDays(today, -days);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const upcoming = (slot: string) => iso(nextDate(slot.split(' ')[0], today));
  const lastWeek = (slot: string) => iso(addDays(nextDate(slot.split(' ')[0], today), -7));
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  function gen(ar: (typeof ARCH)[number], tutor: boolean): Profile {
    const hobbies: string[] = [];
    while (hobbies.length < 3) {
      const h = r() < 0.9 ? pick(ar.hobbies) : pick(HOBBIES);
      if (!hobbies.includes(h)) hobbies.push(h);
    }
    const learning = r() < 0.88 ? pick(ar.learning) : pick(LEARNING);
    const social = +clamp(ar.social + (r() - 0.5) * 0.28).toFixed(2);
    const approach = +clamp(ar.approach + (r() - 0.5) * 0.28).toFixed(2);
    const ns = tutor ? 2 + (r() < 0.4 ? 1 : 0) : 1 + (r() < 0.5 ? 1 : 0);
    const subjects: string[] = [];
    while (subjects.length < ns) {
      const s = r() < 0.8 ? pick(ar.subjects) : pick(SUBJECTS);
      if (!subjects.includes(s)) subjects.push(s);
    }
    const sched = [pick(ar.sched)];
    if (r() < 0.45) {
      const s2 = pick(SCHED);
      if (!sched.includes(s2)) sched.push(s2);
    }
    const grades = [pick(ar.grades)];
    if (tutor && r() < 0.6) {
      const g = pick(ar.grades);
      if (!grades.includes(g)) grades.push(g);
    }
    return { hobbies, learning, social, approach, subjects, sched, grades };
  }

  function slotsFor(sched: string[]) {
    const out: string[] = [];
    const add = (days: string[], hrs: string[]) =>
      days.forEach((d) => hrs.forEach((h) => { if (r() < 0.55) out.push(`${d} ${h}`); }));
    if (sched.includes('Weekday mornings')) add(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ['08:00', '09:00', '10:00']);
    if (sched.includes('Weekday afternoons')) add(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ['13:00', '14:00', '15:00']);
    if (sched.includes('Weekday evenings')) add(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ['17:00', '18:00', '19:00']);
    if (sched.includes('Weekends')) add(['Sat', 'Sun'], ['09:00', '10:00', '11:00', '14:00']);
    if (!out.length) out.push('Sat 10:00');
    return out;
  }

  const used = new Set(['Bea Santos', 'Paolo Reyes', 'Jen Dizon', 'Liza Santos']);
  const name = () => {
    let n: string;
    do n = `${pick(FIRST)} ${pick(LAST)}`;
    while (used.has(n));
    used.add(n);
    return n;
  };
  const slug = (n: string) => n.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

  const userRows: UserRow[] = [];
  const appRows: (typeof t.applications.$inferInsert)[] = [];
  const docRows: (typeof t.applicationDocs.$inferInsert)[] = [];
  const histRows: (typeof t.applicationHistory.$inferInsert)[] = [];
  const base = (id: string, role: UserRow['role'], nm: string, email: string, joinedDaysAgo: number): UserRow => ({
    id, role, name: nm, email, passwordHash, status: 'active', joined: dayAgo(joinedDaysAgo),
  });

  userRows.push(base('admin', 'admin', 'Registrar Admin', 'admin@tutorstogo.ph', 265));

  function addDocs(id: string, s: string) {
    docRows.push(
      { userId: id, kind: 'prc', fileName: `PRC-license-${s}.pdf` },
      { userId: id, kind: 'birth', fileName: `PSA-birth-certificate-${s}.pdf` },
      { userId: id, kind: 'tor', fileName: `TOR-${s}.pdf` },
    );
    return `https://youtu.be/ttg-demo-${s}`;
  }

  function tutor(id: string, nm: string, profile: Profile, extra: Partial<UserRow> = {}, email?: string) {
    const s = slug(nm);
    const years = 1 + Math.floor(r() * 12);
    const method = pick(METHODS);
    const curricula = [pick(CURRICULA)];
    const c2 = pick(CURRICULA);
    if (!curricula.includes(c2)) curricula.push(c2);
    const row: UserRow = {
      ...base(id, 'teacher', nm, email ?? `${s}@tutor.ph`, 60 + Math.floor(r() * 150)),
      profile,
      rate: 250 + 50 * Math.floor(r() * 8),
      years,
      education: EDU[profile.subjects[0]],
      curricula,
      method,
      headline: `${profile.subjects[0]} tutor for ${profile.grades.join(' & ')} learners`,
      bio: `Licensed teacher with ${years} year${years > 1 ? 's' : ''} in ${profile.grades[0] === 'College' ? 'college classrooms' : 'DepEd schools'}. Plans lessons around the ${method} and follows the ${curricula[0]}. Off the clock: ${profile.hobbies.join(', ').toLowerCase()}.`,
      slots: slotsFor(profile.sched),
      ...extra,
    };
    userRows.push(row);
    return row;
  }

  function approve(id: string, s: string) {
    const video = addDocs(id, s);
    const submitted = 50 + Math.floor(r() * 8);
    appRows.push({ userId: id, status: 'approved', submittedAt: dayAgo(submitted), note: '', video });
    histRows.push(
      { userId: id, status: 'pending', at: stampAgo(submitted, 10) },
      { userId: id, status: 'approved', at: stampAgo(submitted - 5, 15), note: 'Documents verified.' },
    );
  }

  const paolo = tutor(
    't_paolo',
    'Paolo Reyes',
    { hobbies: ['Basketball', 'Volleyball', 'Drawing'], learning: 'Visual', social: 0.7, approach: 0.5, subjects: ['Math', 'Science'], sched: ['Weekday evenings', 'Weekends'], grades: ['Junior High', 'Senior High'] },
    {
      rate: 450,
      years: 6,
      education: 'BSEd Mathematics · Philippine Normal University',
      curricula: ['MATATAG Curriculum', 'K–12 Basic Education'],
      method: "4A's lesson plan",
      headline: 'Math and Science for Junior and Senior High',
      bio: "Licensed professional teacher (LPT) with six years at a public high school in Pasig. I teach with the 4A's — every lesson starts with an activity, usually a drawing or a quick game, before we get to the formula. I coach a barangay basketball team on weekends.",
      slots: ['Mon 17:00', 'Mon 18:00', 'Tue 17:00', 'Tue 18:00', 'Wed 18:00', 'Thu 17:00', 'Thu 19:00', 'Sat 09:00', 'Sat 10:00', 'Sat 11:00'],
    },
  );
  approve(paolo.id, 'paolo.reyes');
  for (let i = 0; i < 39; i++) {
    const nm = name();
    tutor(`t${i}`, nm, gen(ARCH[i % 4], true));
    approve(`t${i}`, slug(nm));
  }

  function applicant(id: string, nm: string, status: AppStatus, note: string, withDocs: boolean, overrides: Partial<UserRow> = {}, email?: string) {
    tutor(id, nm, gen(ARCH[Math.floor(r() * 4)], true), overrides, email);
    const submittedDays = 1 + Math.floor(r() * 6);
    const video = withDocs ? addDocs(id, slug(nm)) : null;
    appRows.push({ userId: id, status, submittedAt: withDocs ? dayAgo(submittedDays) : null, note, video });
    if (withDocs) histRows.push({ userId: id, status: 'pending', at: stampAgo(submittedDays, 11) });
    if (status === 'needs_changes') histRows.push({ userId: id, status, at: stampAgo(0, 9), note });
  }
  applicant('t_jen', 'Jen Dizon', 'draft', '', false, {
    profile: { hobbies: ['K-drama', 'Reading', 'Cooking'], learning: 'Reading/Writing', social: 0.4, approach: 0.25, subjects: ['English', 'Filipino'], sched: ['Weekday afternoons'], grades: ['Junior High'] },
    headline: 'English and Filipino for Junior High',
    rate: 350,
    education: EDU.English,
  }, 'jen@tutor.ph');
  applicant('t_a1', name(), 'pending', '', true);
  applicant('t_a2', name(), 'pending', '', true);
  applicant('t_a3', name(), 'needs_changes', 'TOR scan is blurry. Please upload a clearer copy.', true);

  const student = (id: string, nm: string, profile: Profile, extra: Partial<UserRow> = {}) => {
    const row: UserRow = {
      ...base(id, 'student', nm, `${slug(nm)}@student.ph`, 60 + Math.floor(r() * 90)),
      profile,
      gradeLabel: pick(GRADE_LABELS[profile.grades[0]]),
      school: pick(SCHOOLS),
      ...extra,
    };
    userRows.push(row);
    return row;
  };
  student('s_bea', 'Bea Santos',
    { hobbies: ['Basketball', 'Volleyball', 'Music'], learning: 'Visual', social: 0.62, approach: 0.45, subjects: ['Math', 'Science'], sched: ['Weekday evenings'], grades: ['Junior High'] },
    { email: 'bea@student.ph', gradeLabel: 'Grade 10', school: 'Rizal High School, Pasig', parentId: 'p_liza' });
  for (let i = 0; i < 59; i++) student(`s${i}`, name(), gen(ARCH[i % 4], false));
  userRows.find((u) => u.id === 's7')!.status = 'deactivated';
  userRows.push({ ...base('p_liza', 'parent', 'Liza Santos', 'liza@parent.ph', 87), childId: 's_bea' });

  const S = userRows.filter((u) => u.role === 'student');
  const approvedIds = new Set(appRows.filter((a) => a.status === 'approved').map((a) => a.userId));
  const Tt = userRows.filter((u) => u.role === 'teacher' && approvedIds.has(u.id));
  const byId = (id: string) => userRows.find((u) => u.id === id)!;

  // Sessions
  const sessRows: (typeof t.tutoringSessions.$inferInsert)[] = [];
  let sid = 0;
  const ses = (o: Omit<typeof t.tutoringSessions.$inferInsert, 'id' | 'createdAt'> & { createdAt?: string }) => {
    const row = { id: `ses${++sid}`, createdAt: stampAgo(14, 12), ...o };
    sessRows.push(row);
    return row;
  };
  const sci = Tt.find((x) => x.id !== 't_paolo' && x.profile!.subjects.includes('Science'))!;
  const learner = (id: string) => {
    const u = byId(id);
    return u.gradeLabel ? `${u.name}, ${u.gradeLabel}` : u.name;
  };
  ses({ studentId: 's_bea', tutorId: 't_paolo', subject: 'Math', date: upcoming('Tue 17:00'), slot: 'Tue 17:00', hours: 1.5, mode: 'Online (Google Meet)', topic: 'Quadratic equations: factoring and word problems', learner: 'Bea Santos, Grade 10', guardian: 'Liza Santos · 0917 555 0142', status: 'accepted', amount: 675 });
  ses({ studentId: 's_bea', tutorId: 't_paolo', subject: 'Math', date: lastWeek('Tue 17:00'), slot: 'Tue 17:00', hours: 1.5, mode: 'Online (Google Meet)', topic: 'Systems of linear equations', learner: 'Bea Santos, Grade 10', status: 'completed', amount: 675, paymentStatus: 'paid', paymentTxn: '5TY20931KD448722N', receiptName: 'paypal-receipt-sep20.png', amountPaid: 675, receiptAt: stampAgo(7, 19, 12), reviewedAt: stampAgo(6, 9) });
  ses({ studentId: 's_bea', tutorId: sci.id, subject: 'Science', date: upcoming('Thu 18:00'), slot: 'Thu 18:00', hours: 1, mode: 'Online (Google Meet)', topic: 'Chemical reactions and balancing equations', learner: 'Bea Santos, Grade 10', status: 'pending', amount: sci.rate! });
  ses({ studentId: 's_bea', tutorId: 't_paolo', subject: 'Science', date: upcoming('Sat 10:00'), slot: 'Sat 10:00', hours: 1, mode: 'In-person', topic: 'Electricity and circuits review', learner: 'Bea Santos, Grade 10', status: 'accepted', amount: 450, paymentStatus: 'for_review', paymentTxn: '8XK29341LM002144', receiptName: 'paypal-receipt-sep26.png', amountPaid: 450, receiptAt: stampAgo(1, 20, 5) });
  ses({ studentId: 's3', tutorId: 't_paolo', subject: 'Math', date: upcoming('Wed 18:00'), slot: 'Wed 18:00', hours: 1, mode: 'Online (Google Meet)', topic: 'Review for 1st quarter exam: linear functions', learner: learner('s3'), guardian: 'Parent · 0998 555 0189', status: 'pending', amount: 450 });
  ses({ studentId: 's11', tutorId: 't_paolo', subject: 'Science', date: upcoming('Mon 17:00'), slot: 'Mon 17:00', hours: 1, mode: 'Online (Google Meet)', topic: 'Genetics: Punnett squares', learner: byId('s11').name, status: 'accepted', amount: 450, paymentStatus: 'paid', paymentTxn: '3JW81123AB990012C', receiptName: 'receipt-s11.jpg', amountPaid: 450, receiptAt: stampAgo(2, 18, 30), reviewedAt: stampAgo(1, 10) });
  const t3 = Tt[3];
  ses({ studentId: 's5', tutorId: t3.id, subject: t3.profile!.subjects[0], date: upcoming(t3.slots![0]), slot: t3.slots![0], hours: 1, mode: 'Online (Google Meet)', topic: 'Essay structure', learner: byId('s5').name, status: 'accepted', amount: t3.rate!, paymentStatus: 'for_review', paymentTxn: '1AB44120XY778810P', receiptName: 'gcash-screenshot.png', amountPaid: t3.rate! - 50, receiptAt: stampAgo(0, 8, 40) });
  const others = S.filter((x) => x.id !== 's_bea');
  for (let w = 1; w <= 8; w++) {
    const n = 2 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const st = pick(others);
      const hrs = pick([1, 1, 1.5, 2]);
      ses({ studentId: st.id, tutorId: 't_paolo', subject: pick(['Math', 'Science']), date: dayAgo(w * 7 - Math.floor(r() * 6)), slot: pick(['Mon 17:00', 'Tue 18:00', 'Thu 17:00', 'Sat 10:00']), hours: hrs, mode: 'Online (Google Meet)', topic: pick(['Linear equations', 'Factoring polynomials', 'Cell structure', 'Forces and motion', 'Quarter exam review']), learner: st.name, status: 'completed', amount: 450 * hrs, rated: 5, paymentStatus: 'paid', paymentTxn: `${sid}PP${Math.floor(r() * 1e9)}`, receiptName: 'receipt.png', amountPaid: 450 * hrs, receiptAt: stampAgo(w * 7, 20), reviewedAt: stampAgo(w * 7 - 1, 9) });
    }
  }

  // Reviews
  const revRows: (typeof t.reviews.$inferInsert)[] = [];
  let rid = 0;
  const rv = (tutorId: string, authorId: string, rating: number, comment: string, anonymous: boolean, days: number, extra: Partial<typeof t.reviews.$inferInsert> = {}) =>
    revRows.push({ id: `r${++rid}`, tutorId, authorId, authorRole: 'student', rating, comment, anonymous, date: dayAgo(days), status: rating <= 2 ? 'new' : 'reviewed', hidden: false, note: '', ...extra });
  rv('t_paolo', 's3', 5, 'We talk about basketball for five minutes before every session, so I actually look forward to Math now.', false, 4);
  rv('t_paolo', 's11', 5, "The 4A's format makes every lesson easy to follow. Very patient.", true, 11);
  rv('t_paolo', 'p_liza', 5, 'Kind and approachable. Bea opened up quickly and her Math grade went up this quarter.', false, 16, { authorRole: 'parent' });
  rv('t_paolo', 's20', 4, 'Uses drawings a lot, which helps me remember. Sometimes runs a little over time.', false, 23);
  for (const tu of Tt) {
    if (tu.id === 't_paolo') continue;
    const n = 2 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) rv(tu.id, pick(S).id, pick([5, 5, 5, 4, 4, 4, 3]), pick(GOOD), r() < 0.35, 1 + Math.floor(r() * 40));
  }
  rv(Tt[5].id, 's14', 2, LOW[0], true, 2);
  rv(Tt[12].id, 's22', 1, LOW[1], false, 1);

  // Groups
  const pick3 = () => [pick(S).id, pick(S).id, pick(S).id];
  const groupRows = [
    { id: 'g1', name: 'Grade 10 Math Barkada', description: 'Weekly problem sets and exam reviews for Grade 10 Math.', subject: 'Math', ownerId: 't_paolo', createdAt: stampAgo(40, 10) },
    { id: 'g2', name: 'Sketch & Study Club', description: 'For students who learn better with drawings. Share your visual notes.', subject: 'Science', ownerId: 's0', createdAt: stampAgo(30, 10) },
    { id: 'g3', name: 'SHS STEM Reviewers', description: 'Tutors and students preparing for college entrance tests.', subject: 'Science', ownerId: Tt[2].id, createdAt: stampAgo(20, 10) },
  ];
  const members: Record<string, string[]> = {
    g1: ['t_paolo', 's_bea', 's3', 's11', 's20'],
    g2: ['s0', 's4', 's8'],
    g3: [...new Set([Tt[2].id, ...pick3()])],
  };
  const inviteRows = [
    { groupId: 'g2', userId: 's_bea', invitedBy: 's0' },
    { groupId: 'g3', userId: 't_paolo', invitedBy: Tt[2].id },
  ];
  const threadRows = [
    { id: 'th1', groupId: 'g1', title: 'Quadratic word problems: stuck on #7', authorId: 's_bea', createdAt: stampAgo(2, 19, 40) },
    { id: 'th2', groupId: 'g1', title: '1st quarter exam coverage', authorId: 't_paolo', createdAt: stampAgo(5, 18) },
    { id: 'th3', groupId: 'g2', title: 'Visual notes: the cell', authorId: 's0', createdAt: stampAgo(3, 16, 10) },
  ];
  const postRows = [
    { threadId: 'th1', authorId: 's_bea', at: stampAgo(2, 19, 40), text: 'How do I set up the equation for the garden area problem? I keep getting a negative width.' },
    { threadId: 'th1', authorId: 't_paolo', at: stampAgo(2, 20, 5), text: 'Draw the garden first and label the path as x on every side. The negative root is the one you throw away — width can’t be negative.' },
    { threadId: 'th1', authorId: 's3', at: stampAgo(2, 20, 20), text: 'The drawing helped me too, thanks Sir!' },
    { threadId: 'th2', authorId: 't_paolo', at: stampAgo(5, 18), text: 'Coverage: polynomial functions, quadratic equations and inequalities. Practice set is pinned in our Saturday session.' },
    { threadId: 'th3', authorId: 's0', at: stampAgo(3, 16, 10), text: 'Uploaded my sketch of plant vs animal cells. Tips welcome.' },
  ];

  db.transaction((tx) => {
    for (const table of [t.posts, t.threads, t.groupInvites, t.groupMembers, t.groups, t.reviews, t.tutoringSessions, t.applicationHistory, t.applicationDocs, t.applications, t.authSessions, t.files, t.settings, t.users]) {
      tx.delete(table).run();
    }
    tx.run(sql`DELETE FROM sqlite_sequence`);
    for (let i = 0; i < userRows.length; i += 50) tx.insert(t.users).values(userRows.slice(i, i + 50)).run();
    tx.insert(t.applications).values(appRows).run();
    tx.insert(t.applicationDocs).values(docRows).run();
    tx.insert(t.applicationHistory).values(histRows).run();
    for (let i = 0; i < sessRows.length; i += 50) tx.insert(t.tutoringSessions).values(sessRows.slice(i, i + 50)).run();
    for (let i = 0; i < revRows.length; i += 50) tx.insert(t.reviews).values(revRows.slice(i, i + 50)).run();
    tx.insert(t.groups).values(groupRows).run();
    tx.insert(t.groupMembers).values(Object.entries(members).flatMap(([groupId, ids]) => ids.map((userId) => ({ groupId, userId, joinedAt: stampAgo(10, 12) })))).run();
    tx.insert(t.groupInvites).values(inviteRows).run();
    tx.insert(t.threads).values(threadRows).run();
    tx.insert(t.posts).values(postRows).run();
    tx.insert(t.settings).values({ id: 1, ...DEFAULT_SETTINGS }).run();
  });
}
