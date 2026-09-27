import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Me } from '../../../shared/types';
import { avatar, fmtDate, fmtTime, hoursLabel, peso, stars } from '../../../shared/format';
import { SUBJECTS, WEEK } from '../../../shared/vocab';
import { useApi } from '../api';
import { PAYMENT, SESSION } from '../labels';
import { BookModal, PayModal, RateModal } from '../modals/StudentModals';
import type { MatchesResponse, SessionView, StudentHome as Home, TutorCard, TutorProfileResponse } from '../types';
import { Avatar, Bar, CardHead, DateTile, ErrorBox, Icon, Loading, MatchRing, PageHead, Seg, Stat, Tag } from '../ui';

export type StudentModal =
  | { type: 'book'; tutorId: string }
  | { type: 'pay'; session: SessionView }
  | { type: 'rate'; tutorId: string; tutorName: string; sessionId?: string };

export function StudentModals({ modal, onClose }: { modal: StudentModal | null; onClose: () => void }) {
  if (!modal) return null;
  if (modal.type === 'book') return <BookModal tutorId={modal.tutorId} onClose={onClose} />;
  if (modal.type === 'pay') return <PayModal session={modal.session} onClose={onClose} />;
  return <RateModal tutorId={modal.tutorId} tutorName={modal.tutorName} sessionId={modal.sessionId} onClose={onClose} />;
}

const canPay = (x: SessionView) => (x.status === 'accepted' || x.status === 'completed') && (x.payment.status === 'unpaid' || x.payment.status === 'rejected');

export function PayTag({ x }: { x: SessionView }) {
  const p = PAYMENT[x.payment.status];
  return <Tag tone={p.tone} icon={p.icon}>{p.label}</Tag>;
}

export const Shared = ({ items }: { items: string[] }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
    {items.map((h) => (
      <Tag key={h} tone="accent" icon="heart">{h}</Tag>
    ))}
  </div>
);

export function StudentHome({ me }: { me: Me }) {
  const q = useApi<Home>('/student/home');
  const [modal, setModal] = useState<StudentModal | null>(null);
  const nav = useNavigate();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const h = q.data;
  const x = h.next;
  return (
    <section className="page" style={{ gap: 22 }}>
      <PageHead title={`Hi, ${me.name.split(' ')[0]}`} sub="Here’s what’s next for your tutoring.">
        <button className="btn btn-primary" onClick={() => nav('/matches')}><Icon name="sparkle" />Find a tutor</button>
      </PageHead>
      <div className="grid stack-md" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <CardHead icon="calendar-star" title={<>Next session {h.moreUp > 0 && <span className="muted" style={{ fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 400 }}>{h.moreUp} more upcoming</span>}</>}>
            <Link to="/sessions" className="link">All sessions</Link>
          </CardHead>
          {!x ? (
            <div className="empty-inline">
              <Icon name="calendar-blank" />
              <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>No upcoming sessions</div>
              <button className="btn btn-secondary btn-sm" onClick={() => nav('/matches')}>Browse your matches</button>
            </div>
          ) : (
            <div style={{ padding: 20, display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <DateTile date={x.date} size="lg" />
              <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{x.subject} · {x.topic}</div>
                <div className="muted row wrap" style={{ gap: '6px 16px', fontSize: 13 }}>
                  <span className="row" style={{ gap: 5 }}><Icon name="clock" />{fmtDate(x.date)}, {fmtTime(x.time)} · {hoursLabel(x.hours)}</span>
                  <span className="row" style={{ gap: 5 }}><Icon name="video-camera" />{x.mode}</span>
                </div>
                <div className="row">
                  <Avatar name={x.tutor} size={30} />
                  <span style={{ fontWeight: 600 }}>{x.tutor}</span>
                  <PayTag x={x} />
                </div>
              </div>
              {canPay(x) && (
                <button className="btn btn-primary" onClick={() => setModal({ type: 'pay', session: x })}>
                  <Icon name="paypal-logo" />Pay {peso(x.amount)}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {h.cluster && <Tag tone="accent" icon="circles-three-plus">Cluster {h.cluster.no}</Tag>}
            <Link to="/profile" className="link">Edit profile</Link>
          </div>
          <h3 style={{ fontSize: 22 }}>{h.cluster?.name ?? 'Complete your profile'}</h3>
          {h.cluster && (
            <p className="muted">You share this cluster with <strong style={{ color: 'var(--color-text)' }}>{h.cluster.count} tutors</strong>.</p>
          )}
          {me.profile && (
            <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: '6px 12px', fontSize: 13 }}>
              <span className="muted">Hobbies</span><span>{me.profile.hobbies.join(', ')}</span>
              <span className="muted">Learns best</span><span>{me.profile.learning}</span>
            </div>
          )}
          <Link to="/lab" className="link row" style={{ marginTop: 'auto', gap: 6 }}><Icon name="chart-scatter" />See how k-means placed you</Link>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon="check-circle" n={h.stats.completed} label="Sessions completed" />
        <Stat icon="clock" n={h.stats.hours} label="Hours tutored" />
        <Stat icon="hourglass" n={h.stats.pending} label="Awaiting tutor reply" />
        <Stat icon="users-three" n={h.stats.groups} label={`Groups${h.stats.invites ? ` · ${h.stats.invites} invite${h.stats.invites > 1 ? 's' : ''}` : ''}`} onClick={() => nav('/groups')} />
      </div>
      <div className="card">
        <CardHead icon="sparkle" title="Top matches for you"><Link to="/matches" className="link">See all matches</Link></CardHead>
        <div className="divided">
          {h.top.map((m) => (
            <div key={m.id} className="stack-md" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1.3fr) minmax(0,1fr) 180px auto', gap: 18, alignItems: 'center', padding: '14px 20px' }}>
              <Avatar name={m.name} size={40} />
              <div style={{ minWidth: 0 }}>
                <Link to={`/tutors/${m.id}`} style={{ fontWeight: 700, color: 'var(--color-text)', textDecoration: 'none' }}>{m.name}</Link>
                <div className="muted" style={{ fontSize: 12 }}>{m.subjects.join(', ')} · {peso(m.rate)}/hr</div>
              </div>
              <Shared items={m.sharedHobbies} />
              <div className="row"><Bar pct={m.pct} /><span style={{ fontWeight: 700, fontSize: 13, width: 36, textAlign: 'right' }}>{m.pct}%</span></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'book', tutorId: m.id })}>Request</button>
            </div>
          ))}
        </div>
      </div>
      {h.toRate.length > 0 && (
        <div className="card">
          <CardHead icon="star" title="Rate your recent sessions" />
          <div className="divided">
            {h.toRate.map((r) => (
              <div key={r.id} className="row" style={{ gap: 14, padding: '12px 20px' }}>
                <Avatar name={r.tutor} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.tutor} · {r.subject}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{fmtDate(r.date)} · {r.topic}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'rate', tutorId: r.tutorId, tutorName: r.tutor, sessionId: r.id })}>
                  <Icon name="star" />Rate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <StudentModals modal={modal} onClose={() => setModal(null)} />
    </section>
  );
}

const SORTS = [
  { value: 'match', label: 'Best match' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price', label: 'Lowest rate' },
] as const;
type Sort = (typeof SORTS)[number]['value'];

export function Matches() {
  const q = useApi<MatchesResponse>('/matches');
  const [subj, setSubj] = useState('All');
  const [sort, setSort] = useState<Sort>('match');
  const [modal, setModal] = useState<StudentModal | null>(null);
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const M = q.data.matches;
  if (!M) return <div className="empty">Complete your matching profile to see tutors. <Link to="/profile">Open your profile</Link></div>;
  const subjects = ['All', ...SUBJECTS.filter((s) => M.inCluster.some((m) => m.subjects.includes(s)))];
  const cur = subjects.includes(subj) ? subj : 'All';
  const by: Record<Sort, (a: TutorCard, b: TutorCard) => number> = {
    match: (a, b) => a.d - b.d,
    rating: (a, b) => b.avg - a.avg || a.d - b.d,
    price: (a, b) => a.rate - b.rate || a.d - b.d,
  };
  const list = M.inCluster.filter((m) => cur === 'All' || m.subjects.includes(cur)).sort(by[sort]);
  return (
    <section className="page">
      <PageHead
        title="Your matches"
        sub={
          <>
            You’re in <strong style={{ color: 'var(--color-text)' }}>Cluster {M.cluster.no}</strong>, “{M.cluster.name}”. {M.cluster.count} tutors share it, ranked by how close their profile is to yours. <Link to="/lab">How was this computed?</Link>
          </>
        }
      >
        <span className="tag tag-outline"><Icon name="circles-three-plus" />{M.settings.approach === 'tutor' ? 'Tutor-only clustering' : 'Joint clustering'} · k = {M.settings.k}</span>
      </PageHead>
      <div className="row wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
        <Seg label="Subject" value={cur} onChange={setSubj} options={subjects.map((s) => ({ value: s, label: s }))} />
        <div className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Sort</span>
          <Seg label="Sort" value={sort} onChange={setSort} options={SORTS.map((s) => ({ ...s }))} />
        </div>
      </div>
      {!list.length && <div className="empty">No tutors in your cluster teach {cur}. Try another subject or check the tutors outside your cluster below.</div>}
      <div className="card-grid">
        {list.map((m) => (
          <article key={m.id} className="card card-hover" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'default' }}>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={m.name} size={46} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Link to={`/tutors/${m.id}`} style={{ fontFamily: 'var(--font-head)', fontSize: 19, fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>{m.name}</Link>
                <div className="muted ellipsis" style={{ fontSize: 12 }}>{m.headline}</div>
              </div>
              <MatchRing pct={m.pct} />
            </div>
            <div className="muted row wrap" style={{ gap: '6px 14px', fontSize: 13 }}>
              <span className="row" style={{ gap: 4 }}><Icon name="star" style={{ color: 'var(--cl-6)' }} />{m.count ? `★ ${m.avg.toFixed(1)} (${m.count})` : 'No reviews yet'}</span>
              <span className="row" style={{ gap: 4 }}><Icon name="money" />{peso(m.rate)}/hr</span>
              <span className="row" style={{ gap: 4 }}><Icon name="books" />{m.subjects.join(', ')}</span>
            </div>
            <Shared items={m.sharedHobbies} />
            <p className="muted pretty" style={{ fontSize: 13 }}>{m.why}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
              {m.blocks.map((b) => (
                <div key={b.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span className="muted">{b.label}</span>
                    <span style={{ fontWeight: 600 }}>{Math.round(b.sim * 100)}%</span>
                  </div>
                  <Bar pct={b.sim * 100} variant="thin" />
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 'auto', paddingTop: 4 }}>
              <button className="btn btn-primary" style={{ flex: 1, height: 36 }} onClick={() => setModal({ type: 'book', tutorId: m.id })}>Request session</button>
              <Link className="btn btn-secondary" style={{ height: 36, padding: '0 14px' }} to={`/tutors/${m.id}`}>Profile</Link>
            </div>
          </article>
        ))}
      </div>
      <div className="card card-clip">
        <CardHead icon="compass" title="Closest tutors outside your cluster" sub="Near your profile overall, but k-means grouped them elsewhere." />
        <div className="table-scroll">
          <table className="table lg hover">
            <thead><tr><th>Tutor</th><th>Cluster</th><th>Subjects</th><th>Match</th><th /></tr></thead>
            <tbody>
              {M.others.map((m) => (
                <tr key={m.id}>
                  <td><div className="row"><Avatar name={m.name} size={30} /><span style={{ fontWeight: 600 }}>{m.name}</span></div></td>
                  <td>C{m.cluster + 1}</td>
                  <td>{m.subjects.join(', ')}</td>
                  <td style={{ fontWeight: 700 }}>{m.pct}%</td>
                  <td style={{ textAlign: 'right' }}><Link to={`/tutors/${m.id}`} className="link">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <StudentModals modal={modal} onClose={() => setModal(null)} />
    </section>
  );
}

export function TutorProfile({ me }: { me: Me }) {
  const { id } = useParams();
  const q = useApi<TutorProfileResponse>(`/tutors/${id}`);
  const [modal, setModal] = useState<StudentModal | null>(null);
  const nav = useNavigate();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const { tutor: t, stats, reviews, match: m } = q.data;
  const p = t.profile;
  const days = WEEK.map((d) => ({ day: d, times: t.slots.filter((s) => s.startsWith(d)).map((s) => fmtTime(s.split(' ')[1])).join(', ') })).filter((x) => x.times);
  const persona = (p.social > 0.6 ? 'Outgoing' : p.social < 0.4 ? 'Reserved' : 'Balanced') + ', ' + (p.approach > 0.6 ? 'exploratory' : p.approach < 0.4 ? 'structured' : 'flexible');
  const avatarColor = avatar(t.name).color;
  const facts = [
    ['books', 'Subjects', p.subjects.join(', ')],
    ['student', 'Levels', p.grades.join(', ')],
    ['graduation-cap', 'Education', t.education || '—'],
    ['flag', 'Curriculum', t.curricula.join(', ') || '—'],
    ['chalkboard', 'Lesson approach', t.method || '—'],
    ['brain', 'Teaches best', `${p.learning} · ${persona}`],
  ];
  return (
    <section className="page" style={{ gap: 18 }}>
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}><Icon name="arrow-left" />Back</button>
      </div>
      <div className="card card-clip" style={{ borderRadius: 16 }}>
        <div style={{ height: 88, background: `color-mix(in srgb, ${avatarColor} 14%, var(--color-surface-2))` }} />
        <div style={{ padding: '0 24px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 20, marginTop: -44 }}>
          <Avatar name={t.name} size={96} style={{ border: '4px solid var(--color-surface)', boxShadow: 'var(--shadow-sm)' }} />
          <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 4 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <Tag tone="ok" icon="seal-check">PRC verified</Tag>
              <Tag tone="accent" icon="circles-three-plus">{m ? `Cluster ${m.cluster}${m.yourCluster ? ' · your cluster' : ''}` : 'Approved tutor'}</Tag>
            </div>
            <h1 style={{ fontSize: 32 }}>{t.name}</h1>
            <div className="muted" style={{ fontSize: 15 }}>{t.headline}</div>
          </div>
          <div className="row wrap" style={{ gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="head-font row" style={{ fontSize: 24, fontWeight: 700, gap: 4 }}><Icon name="star" style={{ color: 'var(--cl-6)', fontSize: 20 }} />{stats.count ? stats.avg.toFixed(1) : '—'}</span>
              <span className="muted" style={{ fontSize: 12 }}>{stats.count} reviews</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="head-font" style={{ fontSize: 24, fontWeight: 700 }}>{t.years}</span>
              <span className="muted" style={{ fontSize: 12 }}>years teaching</span>
            </div>
            {m && <MatchRing pct={m.pct} size={64} />}
          </div>
        </div>
      </div>
      <div className="grid stack-md" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div className="card card-pad" style={{ gap: 14 }}>
            <h3 style={{ fontSize: 18 }}>About</h3>
            <p className="pretty" style={{ fontSize: 15, lineHeight: 1.6 }}>{t.bio}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {facts.map(([icon, label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 10 }}>
                  <Icon name={icon} style={{ fontSize: 20, color: 'var(--color-accent)' }} />
                  <div><div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontWeight: 600 }}>{value}</div></div>
                </div>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Hobbies</span>
              {p.hobbies.map((h) => <Tag key={h} tone="neutral">{h}</Tag>)}
            </div>
          </div>
          <div className="card card-pad">
            <h3 style={{ fontSize: 18 }}>Weekly availability</h3>
            {!days.length && <p className="muted">No open hours yet.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {days.map((d) => (
                <div key={d.day} style={{ padding: 12, borderRadius: 10, background: 'var(--color-surface-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 700 }}>{d.day}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{d.times}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card card-clip">
            <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <h3 style={{ fontSize: 18 }}>Reviews</h3>
                <span className="muted" style={{ fontSize: 12 }}>From past students and parents</span>
              </div>
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                <span className="head-font" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{stats.count ? stats.avg.toFixed(1) : '—'}</span>
                {stats.count > 0 && <span style={{ color: 'var(--cl-6)', letterSpacing: '.05em' }}>{stars(stats.avg)}</span>}
              </div>
              <RatingDist stats={stats} />
            </div>
            {!reviews.length && <p className="muted" style={{ padding: 20 }}>No reviews yet.</p>}
            <div className="divided">
              {reviews.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 12, padding: '16px 20px' }}>
                  <Avatar name={r.author ?? 'Anonymous'} size={34} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{r.by}</span>
                      <span style={{ color: 'var(--cl-6)', fontSize: 12, letterSpacing: '.05em' }}>{stars(r.rating)}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{fmtDate(r.date)}</span>
                    </div>
                    <p className="pretty" style={{ fontSize: 14 }}>{r.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="sticky-md-off" style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card card-pad" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="head-font" style={{ fontSize: 30, fontWeight: 700 }}>{peso(t.rate)}</span>
              <span className="muted" style={{ fontSize: 13 }}>per hour</span>
            </div>
            {me.role === 'student' && (
              <button className="btn btn-primary btn-lg" onClick={() => setModal({ type: 'book', tutorId: t.id })}><Icon name="calendar-plus" />Request a session</button>
            )}
            <div className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <span className="row" style={{ gap: 8 }}><Icon name="check-circle" style={{ color: 'var(--t-ok-fg)' }} />Pay with PayPal after {t.name.split(' ')[0]} accepts</span>
              <span className="row" style={{ gap: 8 }}><Icon name="shield-check" style={{ color: 'var(--t-ok-fg)' }} />Receipts verified by Tutors To Go</span>
            </div>
          </div>
          {m && (
            <div className="card card-pad">
              <div className="row" style={{ gap: 8 }}><Icon name="sparkle" style={{ fontSize: 20, color: 'var(--color-accent)' }} /><h3 style={{ fontSize: 17 }}>Why you matched · {m.pct}%</h3></div>
              <p className="muted pretty" style={{ fontSize: 13 }}>{m.why}</p>
              {m.blocks.map((b) => (
                <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr) 38px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <span>{b.label}</span>
                  <Bar pct={b.sim * 100} />
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{Math.round(b.sim * 100)}%</span>
                </div>
              ))}
              <Shared items={m.sharedHobbies} />
            </div>
          )}
        </aside>
      </div>
      <StudentModals modal={modal} onClose={() => setModal(null)} />
    </section>
  );
}

export function RatingDist({ stats, thick }: { stats: { count: number; dist: number[] }; thick?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: thick ? 4 : 3, minWidth: 200, flex: 1, maxWidth: thick ? 380 : 280 }}>
      {[5, 4, 3, 2, 1].map((n, i) => (
        <div key={n} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr) 20px', gap: 8, alignItems: 'center', fontSize: thick ? 12 : 11 }}>
          <span>{n} ★</span>
          <Bar pct={stats.count ? (stats.dist[i] / stats.count) * 100 : 0} color="var(--cl-6)" variant={thick ? 'thick' : undefined} />
          <span className="muted">{stats.dist[i]}</span>
        </div>
      ))}
    </div>
  );
}

const SESSION_TABS = [
  { k: 'pending', title: 'Requested', empty: 'No pending requests.' },
  { k: 'accepted', title: 'Upcoming', empty: 'Nothing scheduled yet.' },
  { k: 'completed', title: 'Completed', empty: 'No completed sessions yet.' },
  { k: 'declined', title: 'Declined', empty: 'Nothing here.' },
] as const;

export function StudentSessions() {
  const q = useApi<{ sessions: SessionView[] }>('/sessions');
  const [tab, setTab] = useState<(typeof SESSION_TABS)[number]['k']>('accepted');
  const [modal, setModal] = useState<StudentModal | null>(null);
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const all = q.data.sessions;
  const cur = SESSION_TABS.find((t) => t.k === tab)!;
  const rows = all.filter((x) => x.status === tab);
  return (
    <section className="page">
      <PageHead title="Sessions" sub="Pay once a tutor accepts. Upload your PayPal receipt and an admin confirms it." />
      <Seg label="Session status" large value={tab} onChange={setTab} options={SESSION_TABS.map((t) => ({ value: t.k, label: `${t.title} · ${all.filter((x) => x.status === t.k).length}` }))} />
      <div className="card card-clip">
        {!rows.length && <div className="empty-inline"><Icon name="calendar-blank" />{cur.empty}</div>}
        <div className="divided">
          {rows.map((r) => {
            const st = SESSION[r.status];
            const showPay = r.status === 'accepted' || r.status === 'completed';
            return (
              <div key={r.id} className="row-hover stack-md" style={{ display: 'grid', gridTemplateColumns: '62px minmax(0,1.1fr) minmax(0,1.4fr) 100px auto', gap: 18, alignItems: 'center', padding: '14px 20px' }}>
                <DateTile date={r.date} />
                <div className="row" style={{ minWidth: 0 }}>
                  <Avatar name={r.tutor} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/tutors/${r.tutorId}`} style={{ fontWeight: 700, color: 'var(--color-text)', textDecoration: 'none' }}>{r.tutor}</Link>
                    <div className="muted" style={{ fontSize: 12 }}>{fmtTime(r.time)} · {hoursLabel(r.hours)} · {r.mode}</div>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.subject}</div>
                  <div className="muted ellipsis" style={{ fontSize: 13 }}>{r.topic}</div>
                </div>
                <div style={{ fontWeight: 700 }}>{peso(r.amount)}</div>
                <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  <Tag tone={st.tone}>{st.label}</Tag>
                  {showPay && <PayTag x={r} />}
                  {canPay(r) && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'pay', session: r })}><Icon name="paypal-logo" />Pay</button>}
                  {r.status === 'completed' && !r.rated && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'rate', tutorId: r.tutorId, tutorName: r.tutor, sessionId: r.id })}><Icon name="star" />Rate</button>
                  )}
                  {r.rated > 0 && <span className="muted" style={{ fontSize: 12 }}>You rated ★ {r.rated}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <StudentModals modal={modal} onClose={() => setModal(null)} />
    </section>
  );
}

