import { useState, type FormEvent } from 'react';
import type { Me, Role } from '../../../shared/types';
import { validateProfile } from '../../../shared/matching';
import { nextDate } from '../../../shared/format';
import { api, useAction, useApi } from '../api';
import { ProfileFields, readProfile, readTutor } from '../ProfileFields';
import { homePath } from '../Shell';
import { Avatar, ErrorBox, Field, flash, Icon, MatchRing, Seg, useTheme, useToast } from '../ui';

type SignupRole = Exclude<Role, 'admin'>;
interface Step1 { name: string; email: string; password: string; gradeLabel: string; school: string; childEmail: string }

const FEATURES = [
  { icon: 'user-focus', title: 'Build your profile', text: 'Hobbies, learning style, personality, subjects, schedule.' },
  { icon: 'circles-three-plus', title: 'Get clustered', text: 'K-means places you with the tutors closest to your profile.' },
  { icon: 'paypal-logo', title: 'Book and pay', text: 'Request a slot, pay with PayPal, rate your tutor after.' },
];

export function Landing() {
  const theme = useTheme();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  return (
    <div className="stack-md" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(380px,1fr)' }}>
      <Hero />
      <section style={{ position: 'relative', padding: '36px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <button className="icon-btn" onClick={theme.toggle} title={theme.label} aria-label={theme.label} style={{ position: 'absolute', top: 24, right: 24, width: 38, height: 38 }}>
          <Icon name={theme.icon} />
        </button>
        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Seg label="Log in or sign up" value={mode} onChange={setMode} large options={[{ value: 'login', label: 'Log in' }, { value: 'signup', label: 'Create account' }]} />
          {mode === 'login' ? <Login /> : <Signup />}
        </div>
      </section>
    </div>
  );
}

function Hero() {
  const pv = useApi<{ preview: null | { student: string; tutor: string; pct: number; shared: string[]; cluster: string; subjects: string } }>('/demo/preview').data?.preview;
  const tue = nextDate('Tue');
  return (
    <section className="hide-md" style={{ position: 'relative', overflow: 'hidden', background: 'var(--color-surface-2)', borderRight: '1px solid var(--color-border)', padding: '36px 56px 40px', display: 'flex', flexDirection: 'column', gap: 44 }}>
      <div className="row">
        <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 20 }}><Icon name="graduation-cap" /></span>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 21 }}>Tutors To Go</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>
        <span className="tag tag-accent" style={{ alignSelf: 'flex-start', height: 28, padding: '0 12px', fontWeight: 700, gap: 6 }}>
          <Icon name="chart-scatter" style={{ fontSize: 15 }} />
          K-means matching for Filipino learners
        </span>
        <h1 style={{ fontSize: 52, lineHeight: 1.04, letterSpacing: '-.02em', textWrap: 'balance' }}>Find a tutor who gets how you learn.</h1>
        <p className="muted pretty" style={{ fontSize: 17 }}>
          Tell us your hobbies, learning style, personality and free time. We group you with licensed tutors who share them, all familiar with the K–12 and MATATAG curriculum.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 18, maxWidth: 640 }}>
        {FEATURES.map((f) => (
          <div key={f.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="icon-tile sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-accent)' }}>
              <Icon name={f.icon} />
            </span>
            <span style={{ fontWeight: 700 }}>{f.title}</span>
            <span className="muted" style={{ fontSize: 13 }}>{f.text}</span>
          </div>
        ))}
      </div>
      {pv && (
        <div style={{ position: 'relative', height: 210, maxWidth: 560, marginTop: 'auto' }} aria-hidden="true">
          <div className="card" style={{ position: 'absolute', left: 0, top: 0, width: 360, boxShadow: 'var(--shadow-md)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="row">
              <Avatar name={pv.student} />
              <Icon name="arrows-left-right" className="muted" />
              <Avatar name={pv.tutor} />
              <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 4, minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{pv.student.split(' ')[0]} ↔ {pv.tutor}</span>
                <span className="muted" style={{ fontSize: 12 }}>{pv.subjects}</span>
              </div>
              <span style={{ marginLeft: 'auto' }}><MatchRing pct={pv.pct} size={46} /></span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pv.shared.map((h) => (
                <span key={h} className="tag tag-accent" style={{ height: 24 }}><Icon name="heart" />{h}</span>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{pv.cluster}</div>
          </div>
          <div className="card" style={{ position: 'absolute', left: 230, top: 126, width: 260, borderRadius: 12, boxShadow: 'var(--shadow-md)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="date-tile" style={{ width: 40, height: 40, borderRadius: 9 }}>
              <span className="mon" style={{ fontSize: 9 }}>{tue.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{tue.getDate()}</span>
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Math session booked</span>
              <span className="muted" style={{ fontSize: 12 }}>Tue 5:00 PM · Online</span>
            </div>
            <span className="tag tag-ok" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 11 }}>Paid</span>
          </div>
        </div>
      )}
    </section>
  );
}

/** A full page load after signing in, so nothing cached from a previous session survives. */
const signedIn = (me: Me, message?: string) => {
  if (message) flash(message);
  window.location.assign(homePath(me));
};

function Login() {
  const toast = useToast();
  const { run, error, busy } = useAction();
  const demo = useApi<{ enabled: boolean; password?: string; accounts?: { label: string; email: string }[] }>('/demo').data;

  const login = async (email: string, password: string) => {
    const r = await run(() => api<{ me: Me }>('/auth/login', { body: { email, password } }));
    if (r) signedIn(r.me);
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    void login(String(fd.get('email') ?? ''), String(fd.get('pass') ?? ''));
  };
  const reset = async () => {
    if (await run(() => api('/demo/reset', { method: 'POST' }))) toast('Demo data reset.');
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ fontSize: 30 }}>Welcome back</h2>
        <p className="muted">Log in to see your matches and sessions.</p>
      </div>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Email">
          <input className="input" style={{ height: 42 }} name="email" type="email" autoComplete="username" placeholder="you@example.com" required />
        </Field>
        <Field label="Password">
          <input className="input" style={{ height: 42 }} name="pass" type="password" autoComplete="current-password" required />
        </Field>
        <ErrorBox error={error} />
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>Log in</button>
      </form>
      {demo?.enabled && (
        <div className="card card-clip">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Demo accounts</span>
            <span className="muted" style={{ fontSize: 12 }}>password {demo.password}</span>
          </div>
          {demo.accounts!.map((d) => (
            <button key={d.email} type="button" className="list-btn" style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }} onClick={() => login(d.email, demo.password!)} disabled={busy}>
              <Avatar name={d.label.split(' · ')[1] ?? d.label} size={32} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{d.email}</span>
              </span>
              <Icon name="arrow-right" className="muted" />
            </button>
          ))}
          <button type="button" className="btn btn-ghost btn-block" style={{ borderRadius: 0, fontSize: 12 }} onClick={reset} disabled={busy}>
            <Icon name="arrow-counter-clockwise" />
            Reset demo data
          </button>
        </div>
      )}
    </>
  );
}

const ROLES: { value: SignupRole; label: string; icon: string }[] = [
  { value: 'student', label: 'Student', icon: 'student' },
  { value: 'teacher', label: 'Tutor', icon: 'chalkboard-teacher' },
  { value: 'parent', label: 'Parent / guardian', icon: 'users' },
];

function Signup() {
  const [role, setRole] = useState<SignupRole>('student');
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<Step1>({ name: '', email: '', password: '', gradeLabel: '', school: '', childEmail: '' });
  const { run, error, setError, busy } = useAction();

  type SignupResult = { me: Me; linked: boolean; cluster: { no: number; count: number } | null };

  async function create(body: object) {
    const r = await run(() => api<SignupResult>('/auth/signup', { body }));
    if (!r) return;
    signedIn(
      r.me,
      role === 'parent'
        ? r.linked
          ? 'Account created and linked to your child.'
          : 'Account created. No student uses that email yet.'
        : role === 'teacher'
          ? 'Account created. Upload your documents to apply.'
          : r.cluster
            ? `Welcome! You’re in Cluster ${r.cluster.no} with ${r.cluster.count} tutors.`
            : 'Welcome to Tutors To Go.',
    );
  }

  function onStep1(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const d: Step1 = {
      name: String(fd.get('name') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      password: String(fd.get('pass') ?? ''),
      gradeLabel: String(fd.get('gradeLabel') ?? ''),
      school: String(fd.get('school') ?? ''),
      childEmail: String(fd.get('childEmail') ?? ''),
    };
    if (!d.name || !d.email || !d.password) return setError('Fill in your name, email and password.');
    if (!/^\S+@\S+\.\S+$/.test(d.email)) return setError('Enter a valid email address.');
    if (d.password.length < 6) return setError('Use at least 6 characters for your password.');
    setData(d);
    setError(null);
    if (role === 'parent') void create({ role, name: d.name, email: d.email, password: d.password, childEmail: d.childEmail || undefined });
    else setStep(2);
  }

  function onStep2(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const profile = readProfile(fd);
    const err = validateProfile(profile);
    if (err) return setError(err);
    void create({
      role,
      name: data.name,
      email: data.email,
      password: data.password,
      gradeLabel: data.gradeLabel,
      school: data.school,
      profile,
      tutor: role === 'teacher' ? readTutor(fd) : undefined,
    });
  }

  if (step === 2)
    return (
      <form onSubmit={onStep2} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-700)' }}>Step 2 of 2</span>
          <h2 style={{ fontSize: 30 }}>{role === 'teacher' ? 'Your teaching profile' : 'Your learning profile'}</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            {role === 'teacher'
              ? 'K-means compares this with student profiles. Next you’ll upload your documents for review.'
              : 'K-means uses this to find tutors like you. You can change it later.'}
          </p>
        </div>
        <ProfileFields mode={role === 'teacher' ? 'tutor' : 'student'} details={role === 'teacher'} />
        <ErrorBox error={error} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => { setStep(1); setError(null); }}>Back</button>
          <button type="submit" className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={busy}>Create account</button>
        </div>
      </form>
    );

  return (
    <form onSubmit={onStep1} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-700)' }}>Step 1 of {role === 'parent' ? 1 : 2}</span>
        <h2 style={{ fontSize: 30 }}>Create your account</h2>
      </div>
      <div role="radiogroup" aria-label="I am a" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {ROLES.map((o) => {
          const on = role === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setRole(o.value)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 6px', borderRadius: 10, border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: on ? 'var(--color-surface)' : 'transparent', color: on ? 'var(--color-text)' : 'var(--color-muted)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}
            >
              <Icon name={o.icon} style={{ fontSize: 22 }} />
              {o.label}
            </button>
          );
        })}
      </div>
      <Field label="Full name"><input className="input" name="name" defaultValue={data.name} autoComplete="name" /></Field>
      <Field label="Email"><input className="input" name="email" type="email" defaultValue={data.email} autoComplete="email" /></Field>
      <Field label="Password"><input className="input" name="pass" type="password" defaultValue={data.password} placeholder="At least 6 characters" autoComplete="new-password" /></Field>
      {role === 'student' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <Field label="Grade or year"><input className="input" name="gradeLabel" defaultValue={data.gradeLabel} placeholder="e.g. Grade 10" /></Field>
          <Field label="School"><input className="input" name="school" defaultValue={data.school} /></Field>
        </div>
      )}
      {role === 'parent' && (
        <>
          <Field label="Your child’s student email"><input className="input" name="childEmail" type="email" defaultValue={data.childEmail} placeholder="e.g. bea@student.ph" /></Field>
          <p className="muted" style={{ fontSize: 12 }}>Parent accounts follow their child’s sessions and leave feedback for tutors.</p>
        </>
      )}
      {role === 'teacher' && (
        <p className="muted" style={{ fontSize: 12 }}>
          Next: your teaching profile. Then you’ll upload your PRC license, PSA birth certificate, transcript of records and a demo video for admin review.
        </p>
      )}
      <ErrorBox error={error} />
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{role === 'parent' ? 'Create account' : 'Continue'}</button>
    </form>
  );
}
