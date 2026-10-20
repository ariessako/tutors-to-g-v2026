/**
 * Matching-profile inputs ("Profile Fields v2" in the design). The inputs are
 * named, so the surrounding <form> reads them with readProfile/readTutor.
 */
import { useState } from 'react';
import { CURRICULA, FIRST_PAYMENT_PERCENTS, GRADES, HOBBIES, INSTALLMENT_INTERVALS, INSTALLMENT_PARTS, HOBBY_MAX, HOBBY_MIN, LEARNING, METHODS, SCHED, SUBJECTS } from '../../shared/vocab';
import type { Profile, TutorDetails } from '../../shared/types';
import { Field, Icon, Tag } from './ui';
import { RATE_TIERS, SENIOR_YEARS, tierFor } from '../../shared/tiers';

const HOBBY_ICONS: Record<string, string> = {
  Basketball: 'basketball', Volleyball: 'volleyball', 'Mobile games': 'game-controller', Drawing: 'paint-brush', Music: 'music-notes',
  'K-drama': 'television', Anime: 'star-four', Reading: 'book-open', Cooking: 'cooking-pot', Dance: 'sneaker-move', Coding: 'code', Hiking: 'mountains',
  Football: 'soccer-ball', Swimming: 'swimming-pool', Singing: 'microphone-stage', Photography: 'camera', 'Arts & crafts': 'scissors', Chess: 'crown', Gardening: 'plant', Traveling: 'airplane-tilt',
};
const LEARNING_ICONS: Record<string, string> = { Visual: 'eye', Auditory: 'ear', 'Reading/Writing': 'pencil-line', Kinesthetic: 'hand-grabbing' };

export function readProfile(fd: FormData): Profile {
  return {
    hobbies: fd.getAll('hobbies').map(String),
    learning: String(fd.get('learning') ?? ''),
    social: (Number(fd.get('social')) || 0) / 100,
    approach: (Number(fd.get('approach')) || 0) / 100,
    subjects: fd.getAll('subjects').map(String),
    sched: fd.getAll('sched').map(String),
    grades: fd.getAll('grades').map(String),
    interests: String(fd.get('interests') ?? '').trim() || undefined,
  };
}

export function readTutor(fd: FormData): TutorDetails {
  const licenseType = fd.get('licenseType') === 'non_licensed' ? 'non_licensed' : 'licensed';
  return {
    licenseType,
    eligibility: licenseType === 'non_licensed' ? ((String(fd.get('eligibility') ?? '') || null) as TutorDetails['eligibility']) : null,
    headline: String(fd.get('headline') ?? '').trim(),
    rate: Number(fd.get('rate')) || 0,
    years: Number(fd.get('years')) || 0,
    education: String(fd.get('education') ?? '').trim(),
    curricula: fd.getAll('curricula').map(String),
    method: String(fd.get('method') || METHODS[0]),
    bio: String(fd.get('bio') ?? '').trim(),
    allowInstallments: fd.get('allowInstallments') === 'on',
    maxInstallments: Number(fd.get('maxInstallments')) || 2,
    minFirstPercent: Number(fd.get('minFirstPercent')) || 50,
    installmentIntervalDays: Number(fd.get('installmentIntervalDays')) || 7,
  };
}

function Chip({ name, value, on, type, icon, onToggle, small }: { name: string; value: string; on: boolean; type: 'checkbox' | 'radio'; icon?: string; onToggle: () => void; small?: boolean }) {
  return (
    <label className={`chip${on ? ' on' : ''}${small ? ' sm' : ''}`}>
      <input className="hidden-input" type={type} name={name} value={value} checked={on} onChange={onToggle} />
      {on ? <Icon name="check-circle" /> : icon ? <Icon name={icon} /> : null}
      {value}
    </label>
  );
}

const Group = ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
  </div>
);

export function ProfileFields({ mode, profile, tutor, details = false }: { mode: 'student' | 'tutor'; profile?: Profile | null; tutor?: Partial<TutorDetails> | null; details?: boolean }) {
  const isTutor = mode === 'tutor';
  const [sel, setSel] = useState(() => ({
    hobbies: profile?.hobbies ?? [],
    learning: profile?.learning ?? '',
    subjects: profile?.subjects ?? [],
    sched: profile?.sched ?? [],
    grades: profile?.grades ?? [],
    curricula: tutor?.curricula ?? [],
    method: tutor?.method ?? '',
  }));
  const [over, setOver] = useState(false);
  const t = { headline: '', rate: 400, years: 1, education: '', bio: '', licenseType: 'licensed' as const, eligibility: null, allowInstallments: false, maxInstallments: 2, minFirstPercent: 50, installmentIntervalDays: 7, ...tutor };
  const [installments, setInstallments] = useState(t.allowInstallments);
  const [years, setYears] = useState(t.years);
  const band = RATE_TIERS[tierFor(t.licenseType, years)];

  const toggle = (key: 'hobbies' | 'subjects' | 'sched' | 'grades' | 'curricula', v: string, limit?: number) => {
    const cur = sel[key];
    if (cur.includes(v)) {
      setSel({ ...sel, [key]: cur.filter((x) => x !== v) });
      setOver(false);
    } else if (limit && cur.length >= limit) {
      setOver(true);
    } else {
      setSel({ ...sel, [key]: [...cur, v] });
      setOver(false);
    }
  };
  const n = sel.hobbies.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {details && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="section-label" style={{ fontSize: 13, letterSpacing: '.06em' }}>Teaching details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <Field label="Headline" style={{ gridColumn: '1 / -1' }}>
              <input className="input sm" name="headline" defaultValue={t.headline} placeholder="e.g. Math and Science for Junior High" maxLength={120} />
            </Field>
            <input type="hidden" name="licenseType" value={t.licenseType} />
            <input type="hidden" name="eligibility" value={t.eligibility ?? ''} />
            <Field label={`Rate per hour (₱${band.min.toLocaleString('en-US')}–₱${band.max.toLocaleString('en-US')})`}>
              <input className="input sm" name="rate" type="number" min={band.min} max={band.max} step={10} defaultValue={Math.min(band.max, Math.max(band.min, t.rate))} />
            </Field>
            <Field label="Years teaching">
              <input className="input sm" name="years" type="number" min={0} defaultValue={t.years} onChange={(e) => setYears(Number(e.target.value) || 0)} />
            </Field>
            <p className="muted" style={{ gridColumn: '1 / -1', fontSize: 12 }}>
              <Icon name="info" /> Your rate tier: <strong>{band.label}</strong>. {band.who} can set any rate from ₱{band.min.toLocaleString('en-US')} to ₱{band.max.toLocaleString('en-US')} an hour{tierFor(t.licenseType, years) === 'licensed' ? `; with ${SENIOR_YEARS}+ years of teaching you move up to ₱${RATE_TIERS.licensed_senior.min}–₱${RATE_TIERS.licensed_senior.max.toLocaleString('en-US')}` : ''}.
            </p>
            <Field label="Degree and school" style={{ gridColumn: '1 / -1' }}>
              <input className="input sm" name="education" defaultValue={t.education} placeholder="e.g. BSEd Mathematics · Philippine Normal University" maxLength={200} />
            </Field>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Familiar with (Philippine curriculum)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CURRICULA.map((v) => (
                <Chip key={v} small name="curricula" value={v} type="checkbox" on={sel.curricula.includes(v)} onToggle={() => toggle('curricula', v)} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Lesson approach you use most</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {METHODS.map((v) => (
                <Chip key={v} small name="method" value={v} type="radio" on={sel.method === v} onToggle={() => setSel({ ...sel, method: v })} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="row" style={{ gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" name="allowInstallments" checked={installments} onChange={(e) => setInstallments(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
              <span><strong>Allow installment payments.</strong> Students can split a session’s fee into parts instead of paying it all at once.</span>
            </label>
            {installments && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <Field label="Up to how many parts">
                  <select className="input sm" name="maxInstallments" defaultValue={t.maxInstallments}>
                    {INSTALLMENT_PARTS.map((n) => <option key={n} value={n}>{n} installments</option>)}
                  </select>
                </Field>
                <Field label="Smallest first payment">
                  <select className="input sm" name="minFirstPercent" defaultValue={t.minFirstPercent}>
                    {FIRST_PAYMENT_PERCENTS.map((n) => <option key={n} value={n}>{n}% of the fee</option>)}
                  </select>
                </Field>
                <Field label="Next parts due every">
                  <select className="input sm" name="installmentIntervalDays" defaultValue={t.installmentIntervalDays}>
                    {INSTALLMENT_INTERVALS.map((n) => <option key={n} value={n}>{n} days</option>)}
                  </select>
                </Field>
                <p className="muted" style={{ gridColumn: '1 / -1', fontSize: 12 }}>The first part is due on the session date; each next part is due this many days after the previous one.</p>
              </div>
            )}
          </div>
          <Field label="Short bio">
            <textarea className="input" name="bio" defaultValue={t.bio} placeholder="Where you teach, how you run a lesson, what you do outside class." maxLength={2000} />
          </Field>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row wrap">
          <span style={{ fontWeight: 700, fontSize: 15 }}>Hobbies</span>
          <Tag tone={n >= HOBBY_MIN ? 'ok' : over ? 'bad' : 'neutral'}>
            <strong>{n} / {HOBBY_MAX}</strong>
          </Tag>
          <span className="muted" style={{ fontSize: 13 }} aria-live="polite">
            {over ? `Unselect one first. ${HOBBY_MAX} is the limit.` : `Pick ${HOBBY_MIN} to ${HOBBY_MAX}. These carry the most weight in matching.`}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {HOBBIES.map((v) => (
            <Chip key={v} name="hobbies" value={v} type="checkbox" icon={HOBBY_ICONS[v]} on={sel.hobbies.includes(v)} onToggle={() => toggle('hobbies', v, HOBBY_MAX)} />
          ))}
        </div>
        <Field label="Other interests (optional)">
          <input className="input sm" name="interests" defaultValue={profile?.interests ?? ''} maxLength={120} placeholder="e.g. robotics, volunteering, Taylor Swift" />
        </Field>
      </div>

      <Group title={isTutor ? 'How you teach best' : 'How you learn best'}>
        {LEARNING.map((v) => (
          <Chip key={v} name="learning" value={v} type="radio" icon={LEARNING_ICONS[v]} on={sel.learning === v} onToggle={() => setSel({ ...sel, learning: v })} />
        ))}
      </Group>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Personality</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[
            ['social', 'Social energy', 'Introvert', 'Extrovert', profile?.social],
            ['approach', 'Approach to learning', 'Structured', 'Exploratory', profile?.approach],
          ].map(([name, label, lo, hi, val]) => (
            <label key={name as string} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', borderRadius: 10, background: 'var(--color-surface-2)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
              <input type="range" name={name as string} min={0} max={100} defaultValue={Math.round(((val as number | undefined) ?? 0.5) * 100)} style={{ accentColor: 'var(--color-accent)', width: '100%' }} />
              <span className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{lo}</span>
                <span>{hi}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Group title={isTutor ? 'Subjects you teach' : 'Subjects you need help with'}>
        {SUBJECTS.map((v) => (
          <Chip key={v} name="subjects" value={v} type="checkbox" on={sel.subjects.includes(v)} onToggle={() => toggle('subjects', v)} />
        ))}
      </Group>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 22 }}>
        <Group title="Free time">
          {SCHED.map((v) => (
            <Chip key={v} name="sched" value={v} type="checkbox" on={sel.sched.includes(v)} onToggle={() => toggle('sched', v)} />
          ))}
        </Group>
        <Group title={isTutor ? 'Levels you handle' : 'Your level'}>
          {GRADES.map((v) =>
            isTutor ? (
              <Chip key={v} name="grades" value={v} type="checkbox" on={sel.grades.includes(v)} onToggle={() => toggle('grades', v)} />
            ) : (
              <Chip key={v} name="grades" value={v} type="radio" on={sel.grades[0] === v} onToggle={() => setSel({ ...sel, grades: [v] })} />
            ),
          )}
        </Group>
      </div>
    </div>
  );
}
