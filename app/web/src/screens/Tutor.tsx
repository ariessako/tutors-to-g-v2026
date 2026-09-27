import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Me } from '../../../shared/types';
import { fmtDate, fmtStamp, fmtTime, hoursLabel, peso, stars } from '../../../shared/format';
import { DOC_KINDS, SCHEDULE_HOURS, WEEK } from '../../../shared/vocab';
import { api, useAction, useApi } from '../api';
import { BarChart } from '../charts';
import { APPLICATION } from '../labels';
import { attempt, ConfirmModal, type ConfirmSpec } from '../modals/Confirm';
import type { ApplicationView, ReviewView, SessionView, TutorStats } from '../types';
import { Avatar, CardHead, DateTile, ErrorBox, Icon, Loading, PageHead, Stat, Tag, useToast } from '../ui';
import { PayTag, RatingDist } from './Student';

interface Dashboard {
  stats: { requests: number; upcoming: number; upcomingPaid: number; avg: number; count: number };
  next: SessionView[];
  weeks: { label: string; value: number; count: number }[];
  recent: ReviewView[];
}

export function TutorHome({ me }: { me: Me }) {
  const approved = me.tutor?.appStatus === 'approved';
  return (
    <section className="page">
      {approved && <TutorDashboard me={me} />}
      {approved && <h2 style={{ fontSize: 22, marginTop: 8 }}>Documents</h2>}
      <Application />
    </section>
  );
}

function TutorDashboard({ me }: { me: Me }) {
  const q = useApi<Dashboard>('/teacher/dashboard');
  const nav = useNavigate();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const d = q.data;
  const total = d.weeks.reduce((s, w) => s + w.value, 0);
  const figures = [
    ['Total', peso(total)],
    ['This week', peso(d.weeks[d.weeks.length - 1]?.value ?? 0)],
    ['Weekly average', peso(total / Math.max(1, d.weeks.length))],
    ['Paid sessions', String(d.weeks.reduce((s, w) => s + w.count, 0))],
  ];
  return (
    <>
      <PageHead title={`Magandang araw, ${me.name.split(' ')[0]}`} sub="Your tutoring at a glance." />
      <div className="stat-grid">
        <Stat icon="bell-ringing" n={d.stats.requests} label="New requests" onClick={() => nav('/tutor/sessions')} />
        <Stat icon="calendar-check" n={d.stats.upcoming} label="Upcoming sessions" onClick={() => nav('/tutor/sessions')} />
        <Stat icon="wallet" n={`${d.stats.upcomingPaid}/${d.stats.upcoming}`} label="Upcoming sessions paid" onClick={() => nav('/tutor/sessions')} />
        <Stat icon="star" n={d.stats.count ? d.stats.avg.toFixed(1) : '—'} label={`Rating from ${d.stats.count} reviews`} onClick={() => nav('/tutor/reviews')} />
      </div>
      <div className="grid stack-md" style={{ gridTemplateColumns: 'minmax(0,1.7fr) minmax(300px,1fr)', alignItems: 'start' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <CardHead icon="chart-bar" title="Earnings and sessions · last 8 weeks">
            <div className="muted row" style={{ gap: 14, fontSize: 12 }}>
              <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--color-accent)' }} />Paid earnings</span>
              <span className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 2, background: 'var(--color-text)' }} />Sessions</span>
            </div>
          </CardHead>
          <div className="row wrap" style={{ gap: 32, padding: '16px 20px 0', alignItems: 'flex-start' }}>
            {figures.map(([l, v]) => (
              <div key={l}><div className="muted" style={{ fontSize: 12 }}>{l}</div><div className="head-font" style={{ fontSize: 26, fontWeight: 700 }}>{v}</div></div>
            ))}
          </div>
          <div style={{ padding: '8px 20px 18px' }}><BarChart data={d.weeks} fmt={(n) => '₱' + n.toLocaleString('en-US')} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <CardHead icon="calendar-check" title="Next sessions" />
            {!d.next.length && <p className="muted" style={{ padding: 20 }}>No accepted sessions yet.</p>}
            <div className="divided">
              {d.next.map((r) => (
                <div key={r.id} className="row" style={{ gap: 12, padding: '12px 20px' }}>
                  <DateTile date={r.date} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.learner}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.subject} · {fmtTime(r.time)}</div>
                  </div>
                  <PayTag x={r} />
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <CardHead icon="star" title="Recent reviews" />
            <div className="divided">
              {d.recent.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 10, padding: '12px 20px' }}>
                  <Avatar name={r.author ?? 'Anonymous'} size={30} />
                  <div>
                    <div style={{ fontSize: 12 }}><span style={{ fontWeight: 600 }}>{r.by}</span> <span style={{ color: 'var(--cl-6)' }}>{stars(r.rating)}</span></div>
                    <p className="muted" style={{ fontSize: 13 }}>{r.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const INTRO: Record<ApplicationView['status'], string> = {
  draft: 'Upload the four requirements below. An admin reviews every application before a tutor can be matched with students.',
  pending: 'Your documents are with the admin team. You can still replace a file while you wait.',
  needs_changes: 'The admin asked for changes. Replace the file mentioned in the note and resubmit.',
  approved: 'Your documents were verified, so you appear in student matches.',
  rejected: 'This application was not approved. You can update your documents and resubmit.',
};
const STEP_INDEX: Record<ApplicationView['status'], number> = { draft: 1, pending: 2, needs_changes: 1, rejected: 1, approved: 4 };

function Application() {
  const q = useApi<{ application: ApplicationView }>('/me/application');
  const [picked, setPicked] = useState<Record<string, File>>({});
  const [formKey, setFormKey] = useState(0);
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const a = q.data.application;
  const approved = a.status === 'approved';
  const stIdx = STEP_INDEX[a.status];
  const label = APPLICATION[a.status];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const video = String(new FormData(e.currentTarget).get('video') ?? '').trim();
    const missing = DOC_KINDS.filter((d) => !picked[d.key] && !a.docs[d.key]).map((d) => d.label);
    if (missing.length) return setError(`Still missing: ${missing.join(', ')}.`);
    if (!/^https?:\/\/\S+\.\S+/.test(video)) return setError('Add a valid video demo link starting with https://');
    const form = new FormData();
    for (const [k, f] of Object.entries(picked)) form.set(k, f);
    form.set('video', video);
    const r = await run(() => api<{ resubmitted: boolean }>('/me/application', { form }));
    if (!r) return;
    setPicked({});
    setFormKey(formKey + 1);
    toast(r.resubmitted ? 'Application submitted. An admin will review it.' : 'Documents updated.');
  }

  return (
    <>
      {!approved && (
        <>
          <PageHead title="Tutor application" sub={INTRO[a.status]} />
          <div className="card row wrap" style={{ padding: '18px 20px', gap: '12px 28px' }}>
            {['Account created', 'Documents uploaded', 'Admin review', 'Approved'].map((l, i) => (
              <div key={l} className="row">
                <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, background: i < stIdx ? 'var(--color-accent)' : i === stIdx ? 'var(--color-accent-100)' : 'var(--color-surface-2)', color: i < stIdx ? 'var(--on-accent)' : i === stIdx ? 'var(--color-accent-700)' : 'var(--color-muted)' }}>
                  {i < stIdx ? '✓' : i + 1}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14, color: i <= stIdx ? 'var(--color-text)' : 'var(--color-muted)' }}>{l}</span>
              </div>
            ))}
            <span style={{ marginLeft: 'auto' }}><Tag tone={label.tone} size="lg">{label.label}</Tag></span>
          </div>
        </>
      )}
      {a.note && !approved && (
        <div className="alert alert-warn" style={{ alignItems: 'flex-start', padding: '14px 16px', borderRadius: 12, fontSize: 14 }}>
          <Icon name="note" style={{ fontSize: 20 }} />
          <div><strong>Note from admin:</strong> {a.note}</div>
        </div>
      )}
      <form key={formKey} onSubmit={submit} className="card" style={{ display: 'flex', flexDirection: 'column', maxWidth: 960 }}>
        {DOC_KINDS.map((d) => {
          const f = picked[d.key];
          const cur = a.docs[d.key];
          return (
            <div key={d.key} className="row wrap" style={{ gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <span className="icon-tile"><Icon name="file-text" /></span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700 }}>{d.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{d.hint}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: f ? 'var(--color-accent-700)' : cur ? 'var(--color-text)' : 'var(--t-bad-fg)' }}>
                  {f ? `Selected: ${f.name}` : cur ? `On file: ${cur.fileName}` : 'Not uploaded yet'}
                </div>
              </div>
              <label className="btn btn-secondary" style={{ height: 36, padding: '0 14px' }}>
                <Icon name="upload-simple" />Upload file
                <input type="file" accept="image/*,.pdf" className="visually-hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setPicked({ ...picked, [d.key]: file }); }} />
              </label>
            </div>
          );
        })}
        <div className="row wrap" style={{ gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <span className="icon-tile"><Icon name="video" /></span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700 }}>Video demo link</div>
            <div className="muted" style={{ fontSize: 12 }}>A 5–10 minute sample lesson on YouTube or Google Drive</div>
          </div>
          <input className="input sm" name="video" type="url" placeholder="https://" defaultValue={a.video} aria-label="Video demo link" style={{ width: 'min(340px, 100%)' }} />
        </div>
        <div className="row wrap" style={{ gap: 14, padding: '16px 20px' }}>
          <ErrorBox error={error} />
          <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{approved ? 'Updating keeps your approved status.' : 'Status changes show up here.'}</span>
          <button type="submit" className="btn btn-primary" style={{ height: 40, padding: '0 18px' }} disabled={busy}>
            <Icon name="paper-plane-tilt" />{a.status === 'draft' ? 'Submit application' : approved ? 'Update documents' : 'Resubmit'}
          </button>
        </div>
      </form>
      {a.history.length > 0 && (
        <div className="card card-pad" style={{ maxWidth: 960, gap: 10 }}>
          <h3 style={{ fontSize: 17 }}>History</h3>
          {a.history.map((h, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 150px minmax(0,1fr)', gap: 14, fontSize: 13 }}>
              <span className="muted">{fmtStamp(h.at)}</span>
              <span style={{ fontWeight: 600 }}>{APPLICATION[h.status as ApplicationView['status']]?.label ?? h.status}</span>
              <span>{h.note}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function TutorSchedule({ me }: { me: Me }) {
  const saved = me.tutor?.slots ?? [];
  const [draft, setDraft] = useState<string[] | null>(null);
  const { run, error } = useAction();
  const toast = useToast();
  const cur = draft ?? saved;
  const set = new Set(cur);
  const dirty = !!draft && JSON.stringify([...draft].sort()) !== JSON.stringify([...saved].sort());
  const toggle = (key: string) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft([...next]);
  };
  async function save() {
    if (!(await run(() => api('/me/slots', { method: 'PUT', body: { slots: cur } })))) return;
    setDraft(null);
    toast('Schedule saved. Students can book these hours.');
  }
  return (
    <section className="page">
      <PageHead title="Weekly schedule" sub={<>Students can only request the hours you open. <strong style={{ color: 'var(--color-text)' }}>{cur.length} hours</strong> open each week.</>}>
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <button className="btn btn-secondary" onClick={() => setDraft(null)} disabled={!dirty}>Discard</button>
          <button className="btn btn-primary" onClick={save} disabled={!dirty}><Icon name="floppy-disk" />Save schedule</button>
        </div>
      </PageHead>
      <ErrorBox error={error} />
      <div className="card" style={{ padding: 18, overflowX: 'auto' }}>
        <div role="grid" aria-label="Weekly open hours" style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, minmax(70px, 1fr))', gap: 5, minWidth: 660 }}>
          <span />
          {WEEK.map((d) => <span key={d} className="muted" style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', paddingBottom: 6 }}>{d}</span>)}
          {SCHEDULE_HOURS.map((h) => (
            <div key={h} role="row" style={{ display: 'contents' }}>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{fmtTime(h)}</span>
              {WEEK.map((d) => {
                const key = `${d} ${h}`;
                const on = set.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    aria-pressed={on}
                    aria-label={`${d} ${fmtTime(h)}`}
                    onClick={() => toggle(key)}
                    style={{ height: 34, border: 0, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: on ? 'var(--color-accent)' : 'var(--color-surface-2)', color: on ? 'var(--on-accent)' : 'var(--color-neutral-500)', transition: 'background .1s' }}
                  >
                    {on ? 'Open' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TutorSessions() {
  const q = useApi<{ sessions: SessionView[] }>('/sessions');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const { run, error } = useAction();
  const toast = useToast();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const all = q.data.sessions;
  const reqs = all.filter((x) => x.status === 'pending');
  const up = all.filter((x) => x.status === 'accepted');
  const done = all.filter((x) => x.status === 'completed').reverse();

  const accept = async (x: SessionView) => {
    if (await run(() => api(`/sessions/${x.id}/respond`, { body: { accept: true } }))) toast(`Accepted. ${x.student.split(' ')[0]} can now pay through PayPal.`);
  };
  const decline = (x: SessionView) =>
    setConfirm({
      title: 'Decline this request?',
      body: `${x.student} will be notified and can book another tutor.`,
      yes: 'Decline request',
      action: attempt(() => api(`/sessions/${x.id}/respond`, { body: { accept: false } }), () => toast('Request declined.')),
    });
  const complete = async (x: SessionView) => {
    if (await run(() => api(`/sessions/${x.id}/complete`, { method: 'POST' }))) toast('Marked as completed. The student can now rate the session.');
  };

  return (
    <section className="page" style={{ gap: 22 }}>
      <PageHead title="Sessions" sub="Accept requests, then watch for the Paid tag once an admin confirms the student’s PayPal receipt." />
      <ErrorBox error={error} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 19 }}>New requests <span className="muted" style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>{reqs.length}</span></h3>
        {!reqs.length && <div className="empty" style={{ padding: 24 }}>No new requests.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))', gap: 14 }}>
          {reqs.map((r) => (
            <article key={r.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row" style={{ gap: 12 }}>
                <Avatar name={r.student} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{r.learner}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{r.subject} · {r.mode}</div>
                </div>
                <span className="head-font" style={{ fontSize: 20, fontWeight: 700 }}>{peso(r.amount)}</span>
              </div>
              <div className="muted row wrap" style={{ gap: '6px 16px', fontSize: 13 }}>
                <span className="row" style={{ gap: 5 }}><Icon name="calendar" />{fmtDate(r.date)}</span>
                <span className="row" style={{ gap: 5 }}><Icon name="clock" />{fmtTime(r.time)} · {hoursLabel(r.hours)}</span>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--color-surface-2)', fontSize: 14 }}>“{r.topic}”</div>
              {r.guardian && <div className="muted row" style={{ fontSize: 12, gap: 6 }}><Icon name="phone" />Guardian: {r.guardian}</div>}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, height: 36 }} onClick={() => accept(r)}><Icon name="check" />Accept</button>
                <button className="btn btn-secondary" style={{ height: 36 }} onClick={() => decline(r)}>Decline</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="card card-clip">
        <CardHead icon="calendar-check" title="Upcoming" />
        {!up.length ? (
          <p className="muted" style={{ padding: 20 }}>No accepted sessions yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="table lg hover">
              <thead><tr><th>When</th><th>Student</th><th>Subject and topic</th><th>Amount</th><th>Payment</th><th /></tr></thead>
              <tbody>
                {up.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap"><div style={{ fontWeight: 600 }}>{fmtDate(r.date)}</div><div className="muted" style={{ fontSize: 12 }}>{fmtTime(r.time)} · {hoursLabel(r.hours)}</div></td>
                    <td><div className="row" style={{ gap: 8 }}><Avatar name={r.student} size={28} />{r.learner}</div></td>
                    <td><div>{r.subject}</div><div className="muted" style={{ fontSize: 12 }}>{r.topic}</div></td>
                    <td style={{ fontWeight: 600 }}>{peso(r.amount)}</td>
                    <td><PayTag x={r} /></td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-xs" onClick={() => complete(r)}>Mark completed</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {done.length > 0 && (
        <div className="card card-clip">
          <CardHead icon="check-circle" title="Completed" />
          <div className="table-scroll">
            <table className="table lg">
              <tbody>
                {done.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDate(r.date)} · {fmtTime(r.time)}</td>
                    <td>{r.learner}</td>
                    <td>{r.subject}</td>
                    <td style={{ fontWeight: 600 }}>{peso(r.amount)}</td>
                    <td><PayTag x={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {confirm && <ConfirmModal spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

export function TutorReviews() {
  const q = useApi<{ stats: TutorStats; reviews: ReviewView[] }>('/teacher/reviews');
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const { stats, reviews } = q.data;
  return (
    <section className="page" style={{ maxWidth: 960 }}>
      <PageHead title="Reviews" sub="Anonymous reviews hide the author’s name. Admins check low ratings." />
      <div className="card row wrap" style={{ padding: 20, gap: 32 }}>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span className="head-font" style={{ fontSize: 52, fontWeight: 700, lineHeight: 1 }}>{stats.count ? stats.avg.toFixed(1) : '—'}</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stats.count > 0 && <span style={{ color: 'var(--cl-6)', letterSpacing: '.05em' }}>{stars(stats.avg)}</span>}
            <span className="muted" style={{ fontSize: 12 }}>{stats.count} reviews</span>
          </div>
        </div>
        <RatingDist stats={stats} thick />
      </div>
      <div className="card card-clip">
        {!reviews.length && <p className="muted" style={{ padding: 20 }}>No reviews yet.</p>}
        <div className="divided">
          {reviews.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 12, padding: '16px 20px' }}>
              <Avatar name={r.author ?? 'Anonymous'} size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{r.by}</span>
                  <span style={{ color: 'var(--cl-6)', fontSize: 12 }}>{stars(r.rating)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{fmtDate(r.date)}</span>
                  {r.hidden && <Tag tone="neutral" size="sm">Hidden by admin</Tag>}
                </div>
                <p style={{ fontSize: 14 }}>{r.comment}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
