import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { AppStatus, PaymentStatus, Profile, TutorDetails } from '../../../shared/types';
import { validateProfile } from '../../../shared/matching';
import { fmtDate, fmtStamp, peso, stars } from '../../../shared/format';
import { api, useAction, useApi } from '../api';
import { APPLICATION, REVIEW } from '../labels';
import { attempt, ConfirmModal, type ConfirmSpec } from '../modals/Confirm';
import { ProfileFields, readProfile, readTutor } from '../ProfileFields';
import type { ReviewView } from '../types';
import { Avatar, CardHead, ErrorBox, Field, Icon, Loading, Modal, PageHead, Seg, Tag, useToast } from '../ui';

/** Opens an uploaded file, or explains that a seeded demo record has no stored file. */
function useOpenFile() {
  const toast = useToast();
  return (fileId: string | null, name: string | null) => {
    if (fileId) window.open(`/api/files/${fileId}`, '_blank', 'noopener');
    else toast(`${name ?? 'This file'} is a demo record, so there’s no uploaded file to open.`);
  };
}

interface Overview {
  counts: { applications: number; payments: number; feedback: number; active: number; deactivated: number };
  queue: {
    apps: { id: string; name: string; subjects: string[] }[];
    payments: { id: string; student: string; amount: number; file: string | null }[];
    feedback: { id: string; tutor: string; rating: number; comment: string }[];
  };
  model: { k: number; approach: string; nS: number; nT: number; iterations: number };
}

export function AdminOverview() {
  const q = useApi<Overview>('/admin/overview');
  const nav = useNavigate();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const { counts: c, queue, model } = q.data;
  const tiles = [
    { n: c.applications, icon: 'identification-card', label: 'Applications to review', sub: 'PRC, PSA, TOR and demo video', to: '/admin/applications' },
    { n: c.payments, icon: 'receipt', label: 'Payments to approve', sub: 'PayPal receipts uploaded by students', to: '/admin/payments' },
    { n: c.feedback, icon: 'chat-circle-text', label: 'Feedback to check', sub: 'New ratings of 3 stars or lower', to: '/admin/feedback' },
    { n: c.active, icon: 'users', label: 'Active accounts', sub: `${c.deactivated} deactivated`, to: '/admin/accounts' },
  ];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <section className="page">
      <PageHead title="Admin overview" sub={`${today} · what needs attention today`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {tiles.map((t) => (
          <button key={t.label} className="stat" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: 18 }} onClick={() => nav(t.to)}>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="icon-tile" style={{ width: 40, height: 40, borderRadius: 10, fontSize: 20 }}><Icon name={t.icon} /></span>
              <Icon name="arrow-up-right" className="muted" />
            </span>
            <span className="head-font" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{t.n}</span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700 }}>{t.label}</span>
              <span className="muted" style={{ fontSize: 12 }}>{t.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div className="card">
          <CardHead icon="identification-card" title="Pending applications" />
          {!queue.apps.length && <p className="muted" style={{ padding: '14px 18px', fontSize: 13 }}>Nothing waiting.</p>}
          <div className="divided">
            {queue.apps.map((a) => (
              <button key={a.id} className="list-btn" onClick={() => nav(`/admin/applications?id=${a.id}`)}>
                <Avatar name={a.name} size={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{a.name}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>{a.subjects.join(', ')}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>Review</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <CardHead icon="receipt" title="Receipts to verify" />
          {!queue.payments.length && <p className="muted" style={{ padding: '14px 18px', fontSize: 13 }}>Nothing waiting.</p>}
          <div className="divided">
            {queue.payments.map((p) => (
              <button key={p.id} className="list-btn" onClick={() => nav('/admin/payments')}>
                <Avatar name={p.student} size={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{p.student}</span>
                  <span className="muted ellipsis" style={{ display: 'block', fontSize: 12 }}>{peso(p.amount)} · {p.file}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>Verify</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <CardHead icon="flag" title="Low ratings to check" />
          {!queue.feedback.length && <p className="muted" style={{ padding: '14px 18px', fontSize: 13 }}>Nothing waiting.</p>}
          <div className="divided">
            {queue.feedback.map((f) => (
              <button key={f.id} className="list-btn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }} onClick={() => nav('/admin/feedback')}>
                <span style={{ fontSize: 13 }}><span style={{ fontWeight: 600 }}>{f.tutor}</span> <span style={{ color: 'var(--cl-6)' }}>{stars(f.rating)}</span></span>
                <span className="muted" style={{ fontSize: 12 }}>{f.comment}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card row wrap" style={{ padding: '18px 20px', gap: 16 }}>
        <span className="icon-tile" style={{ width: 40, height: 40, borderRadius: 10, fontSize: 20 }}><Icon name="chart-scatter" /></span>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontWeight: 700 }}>Matching model</div>
          <div className="muted" style={{ fontSize: 13 }}>
            k = {model.k}, {model.approach === 'tutor' ? 'tutor-only' : 'joint'} clustering of {model.nS} students and {model.nT} approved tutors. Converged in {model.iterations} iterations.
          </div>
        </div>
        <button className="btn btn-secondary" style={{ height: 36 }} onClick={() => nav('/lab')}>Open K-means lab</button>
      </div>
    </section>
  );
}

interface AppRow { id: string; name: string; subjects: string[]; status: AppStatus; submittedAt: string | null; docCount: number }
interface AppDetail {
  id: string;
  name: string;
  email: string;
  education: string;
  profile: Profile | null;
  curricula: string[];
  method: string;
  rate: number;
  status: AppStatus;
  note: string;
  video: string;
  docs: { kind: string; label: string; fileName: string | null; fileId: string | null }[];
  history: { status: AppStatus; at: string; note: string }[];
}

const APP_FILTERS: { value: AppStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'needs_changes', label: 'Needs changes' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'draft', label: 'Not submitted' },
  { value: 'all', label: 'All' },
];

export function AdminApplications() {
  const q = useApi<{ applications: AppRow[] }>('/admin/applications');
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<AppStatus | 'all'>('pending');
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const all = q.data.applications;
  const list = all.filter((a) => filter === 'all' || a.status === filter);
  const wanted = params.get('id');
  const sel = list.find((a) => a.id === wanted) ?? (wanted ? all.find((a) => a.id === wanted) : undefined) ?? list[0];
  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Tutor applications" sub="Check each applicant’s PRC license, PSA birth certificate, transcript and demo video. Only approved tutors enter the matching model." />
      <Seg
        label="Application status"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setParams({});
        }}
        options={APP_FILTERS.map((o) => ({ value: o.value, label: `${o.label} · ${o.value === 'all' ? all.length : all.filter((a) => a.status === o.value).length}` }))}
      />
      <div className="grid stack-md" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(380px,1.1fr)', alignItems: 'start' }}>
        <div className="card" style={{ padding: 6 }}>
          {!list.length && <p className="muted" style={{ padding: 20 }}>No applications here.</p>}
          {list.map((a) => {
            const st = APPLICATION[a.status];
            return (
              <button key={a.id} className="list-btn" aria-current={sel?.id === a.id} onClick={() => setParams({ id: a.id })} style={{ padding: '10px 12px', borderRadius: 10, background: sel?.id === a.id ? 'var(--color-accent-100)' : undefined }}>
                <Avatar name={a.name} size={36} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{a.name}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>{a.subjects.join(', ')} · {a.submittedAt ? fmtDate(a.submittedAt) : '—'} · {a.docCount} / 4 files</span>
                </span>
                <Tag tone={st.tone} size="sm">{st.label}</Tag>
              </button>
            );
          })}
        </div>
        {sel && <ApplicationPanel key={sel.id} id={sel.id} />}
      </div>
    </section>
  );
}

function ApplicationPanel({ id }: { id: string }) {
  const q = useApi<{ application: AppDetail }>(`/admin/applications/${id}`);
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  const openFile = useOpenFile();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const a = q.data.application;
  const st = APPLICATION[a.status];
  const p = a.profile;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const status = String(fd.get('status') ?? '') as AppStatus;
    const note = String(fd.get('note') ?? '').trim();
    if (!status) return setError('Choose a status.');
    if ((status === 'needs_changes' || status === 'rejected') && !note) return setError('Add a note so the applicant knows what to fix.');
    if (await run(() => api(`/admin/applications/${a.id}/status`, { body: { status, note } })))
      toast(`${a.name}: ${APPLICATION[status].label}.${status === 'approved' ? ' They now appear in matches.' : ''}`);
  }

  const facts = [
    ['Subjects', p ? `${p.subjects.join(', ')} · ${p.grades.join(', ')}` : '—'],
    ['Curriculum', a.curricula.join(', ') || '—'],
    ['Lesson approach', a.method || '—'],
    ['Teaches best', p?.learning || '—'],
    ['Hobbies', p?.hobbies.join(', ') || '—'],
    ['Rate', `${peso(a.rate)}/hr`],
  ];
  return (
    <div className="card sticky-md-off" style={{ boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 84 }}>
      <div className="row" style={{ gap: 14, padding: '18px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <Avatar name={a.name} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 20 }}>{a.name}</h3>
          <div className="muted" style={{ fontSize: 12 }}>{a.email} · {a.education || '—'}</div>
        </div>
        <Tag tone={st.tone} size="lg">{st.label}</Tag>
      </div>
      <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: '8px 14px', fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}><span className="muted">{k}</span><span>{v}</span></div>
        ))}
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--color-border)' }}>
        <div className="section-label">Documents</div>
        {a.docs.map((d) => (
          <div key={d.kind} className="row" style={{ padding: '8px 10px', borderRadius: 9, background: 'var(--color-surface-2)' }}>
            <Icon name="file-pdf" style={{ fontSize: 20, color: 'var(--color-accent)' }} />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              <span className="muted ellipsis" style={{ fontSize: 12 }}>{d.fileName ?? 'Not uploaded'}</span>
            </span>
            {d.fileName ? (
              <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 7 }} onClick={() => openFile(d.fileId, d.fileName)}>View</button>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-bad-fg)' }}>Missing</span>
            )}
          </div>
        ))}
        <div className="row" style={{ padding: '8px 10px', borderRadius: 9, background: 'var(--color-surface-2)' }}>
          <Icon name="video" style={{ fontSize: 20, color: 'var(--color-accent)' }} />
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Video demo</span>
            {a.video ? (
              <a href={a.video} target="_blank" rel="noopener noreferrer" className="ellipsis" style={{ fontSize: 12 }}>{a.video}</a>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--t-bad-fg)' }}>Not provided</span>
            )}
          </span>
        </div>
      </div>
      <form key={`${a.status}-${a.note}`} onSubmit={submit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="section-label">Update status</div>
        <div className="row wrap" style={{ gap: 8 }}>
          {(['approved', 'needs_changes', 'rejected', 'pending'] as const).map((s) => (
            <label key={s} className="row btn-secondary" style={{ gap: 8, height: 36, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input type="radio" name="status" value={s} defaultChecked={a.status === s} style={{ accentColor: 'var(--color-accent)' }} />
              {{ approved: 'Approve', needs_changes: 'Request changes', rejected: 'Reject', pending: 'Pending' }[s]}
            </label>
          ))}
        </div>
        <textarea className="input" name="note" defaultValue={a.note} placeholder="Note to applicant (required when requesting changes or rejecting)" aria-label="Note to applicant" style={{ minHeight: 76 }} />
        <ErrorBox error={error} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>Update application</button>
        </div>
      </form>
      {a.history.length > 0 && (
        <div style={{ padding: '12px 20px 18px', display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--color-border)' }}>
          {a.history.map((h, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 120px minmax(0,1fr)', gap: 10, fontSize: 12 }}>
              <span className="muted">{fmtStamp(h.at)}</span>
              <span style={{ fontWeight: 600 }}>{APPLICATION[h.status]?.label ?? h.status}</span>
              <span>{h.note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TutorRow extends TutorDetails {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'deactivated';
  profile: Profile;
  avg: number;
  count: number;
}

export function AdminTutors() {
  const [q, setQ] = useState('');
  const res = useApi<{ tutors: TutorRow[] }>(`/admin/tutors?q=${encodeURIComponent(q)}`);
  const [form, setForm] = useState<{ tutor: TutorRow | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const toast = useToast();
  const rows = res.data?.tutors;
  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Tutor store" sub="Add, update or remove tutors. Each record notes the Philippine curriculum the tutor follows and the lesson format they use.">
        <button className="btn btn-primary" onClick={() => setForm({ tutor: null })}><Icon name="plus" />Add a tutor</button>
      </PageHead>
      <div className="card card-clip">
        <div className="row" style={{ gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="search">
            <Icon name="magnifying-glass" />
            <input className="input" placeholder="Search by name, email or subject" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tutors" />
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{rows?.length ?? '…'} tutors</span>
        </div>
        {!rows ? (
          res.error ? <ErrorBox error={res.error.message} /> : <Loading />
        ) : (
          <div className="table-scroll">
            <table className="table hover">
              <thead><tr><th>Tutor</th><th>Subjects and levels</th><th>Curriculum · approach</th><th>Rate</th><th>Rating</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td><div className="row"><Avatar name={t.name} size={32} /><div><div style={{ fontWeight: 700 }}>{t.name}</div><div className="muted" style={{ fontSize: 12 }}>{t.email}</div></div></div></td>
                    <td><div>{t.profile?.subjects.join(', ')}</div><div className="muted" style={{ fontSize: 12 }}>{t.profile?.grades.join(', ')}</div></td>
                    <td style={{ maxWidth: 260 }}><div>{t.curricula.join(', ')}</div><div className="muted" style={{ fontSize: 12 }}>{t.method}</div></td>
                    <td style={{ fontWeight: 600 }}>{peso(t.rate)}</td>
                    <td className="nowrap">{t.count ? `★ ${t.avg.toFixed(1)} (${t.count})` : '—'}</td>
                    <td><Tag tone={t.status === 'active' ? 'ok' : 'neutral'} size="sm">{t.status === 'active' ? 'Active' : 'Deactivated'}</Tag></td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-sm btn-icon" title={`Edit ${t.name}`} aria-label={`Edit ${t.name}`} onClick={() => setForm({ tutor: t })}><Icon name="pencil-simple" /></button>{' '}
                      <button
                        className="btn btn-danger btn-sm btn-icon"
                        title={`Delete ${t.name}`}
                        aria-label={`Delete ${t.name}`}
                        onClick={() =>
                          setConfirm({
                            title: `Delete ${t.name}?`,
                            body: 'This removes the tutor, their reviews and their sessions. It can’t be undone.',
                            yes: 'Delete tutor',
                            action: attempt(() => api(`/admin/tutors/${t.id}`, { method: 'DELETE' }), () => toast(`${t.name} was deleted.`)),
                          })
                        }
                      >
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <TutorFormModal tutor={form.tutor} onClose={() => setForm(null)} />}
      {confirm && <ConfirmModal spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

function TutorFormModal({ tutor, onClose }: { tutor: TutorRow | null; onClose: () => void }) {
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  const [created, setCreated] = useState<{ name: string; email: string; tempPassword: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a name and a valid email.');
    const profile = readProfile(fd);
    const err = validateProfile(profile);
    if (err) return setError(err);
    const details = readTutor(fd);
    if (!details.curricula.length) return setError('Pick at least one curriculum the tutor is familiar with.');
    const body = { name, email, profile, tutor: details };
    if (tutor) {
      if (!(await run(() => api(`/admin/tutors/${tutor.id}`, { method: 'PUT', body })))) return;
      onClose();
      toast('Tutor updated.');
    } else {
      const r = await run(() => api<{ tempPassword: string }>('/admin/tutors', { body }));
      if (r) setCreated({ name, email, tempPassword: r.tempPassword });
    }
  }

  if (created)
    return (
      <Modal onClose={onClose} label="Tutor added">
        <div className="dialog-title">{created.name} was added</div>
        <p className="dialog-body">They appear in student matches now. Share these login details with them; the password is shown only once.</p>
        <dl style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr)', gap: '8px 16px', margin: 0 }}>
          <dt className="muted">Email</dt><dd style={{ margin: 0 }}>{created.email}</dd>
          <dt className="muted">Password</dt><dd style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace' }}>{created.tempPassword}</dd>
        </dl>
        <div className="dialog-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </Modal>
    );

  return (
    <Modal onClose={onClose} width={820} top label={tutor ? `Edit ${tutor.name}` : 'Add a tutor'}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="dialog-title">{tutor ? `Edit ${tutor.name}` : 'Add a tutor'}</div>
        <div className="stack-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Full name"><input className="input" name="name" defaultValue={tutor?.name ?? ''} /></Field>
          <Field label="Email"><input className="input" name="email" type="email" defaultValue={tutor?.email ?? ''} /></Field>
        </div>
        <ProfileFields mode="tutor" details profile={tutor?.profile} tutor={tutor} />
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Save tutor</button>
        </div>
      </form>
    </Modal>
  );
}

interface AccountRow { id: string; name: string; email: string; role: 'student' | 'teacher' | 'parent'; joined: string; status: 'active' | 'deactivated' }
const ROLE_NAMES = { student: 'Student', teacher: 'Tutor', parent: 'Parent' } as const;

export function AdminAccounts() {
  const [role, setRole] = useState<'all' | AccountRow['role']>('all');
  const [q, setQ] = useState('');
  const res = useApi<{ total: number; users: AccountRow[] }>(`/admin/users?role=${role}&q=${encodeURIComponent(q)}`);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const { run, error } = useAction();
  const toast = useToast();
  const d = res.data;

  const toggle = (u: AccountRow) => {
    if (u.status === 'active')
      setConfirm({
        title: `Deactivate ${u.name}?`,
        body: `They won’t be able to log in${u.role === 'teacher' ? ' and will drop out of student matches' : u.role === 'student' ? ' and will be left out of clustering' : ''}. You can reactivate them any time.`,
        yes: 'Deactivate',
        action: attempt(() => api(`/admin/users/${u.id}/status`, { body: { status: 'deactivated' } }), () => toast(`${u.name} was deactivated.`)),
      });
    else void run(() => api(`/admin/users/${u.id}/status`, { body: { status: 'active' } })).then((r) => r && toast(`${u.name} was reactivated.`));
  };

  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Accounts" sub="Deactivated accounts can’t log in and are left out of k-means clustering." />
      <ErrorBox error={error} />
      <div className="card card-clip">
        <div className="row wrap" style={{ gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <Seg label="Role" value={role} onChange={setRole} options={[{ value: 'all', label: 'All' }, { value: 'student', label: 'Students' }, { value: 'teacher', label: 'Tutors' }, { value: 'parent', label: 'Parents' }]} />
          <div className="search" style={{ maxWidth: 320 }}>
            <Icon name="magnifying-glass" />
            <input className="input" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{d?.total ?? '…'} accounts</span>
        </div>
        {!d ? (
          res.error ? <ErrorBox error={res.error.message} /> : <Loading />
        ) : (
          <div className="table-scroll">
            <table className="table hover">
              <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Joined</th><th>Status</th><th /></tr></thead>
              <tbody>
                {d.users.map((u) => {
                  const act = u.status === 'active';
                  return (
                    <tr key={u.id}>
                      <td><div className="row"><Avatar name={u.name} size={30} /><span style={{ fontWeight: 600 }}>{u.name}</span></div></td>
                      <td>{ROLE_NAMES[u.role]}</td>
                      <td className="muted">{u.email}</td>
                      <td>{fmtDate(u.joined)}</td>
                      <td><Tag tone={act ? 'ok' : 'bad'} size="sm">{act ? 'Active' : 'Deactivated'}</Tag></td>
                      <td style={{ textAlign: 'right' }}>
                        <button className={`btn btn-xs ${act ? 'btn-danger' : 'btn-primary'}`} onClick={() => toggle(u)}>{act ? 'Deactivate' : 'Reactivate'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {d && d.total > d.users.length && <p className="muted" style={{ padding: '12px 16px', fontSize: 12 }}>Showing {d.users.length} of {d.total}. Search to narrow down.</p>}
      </div>
      {confirm && <ConfirmModal spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

interface PaymentRow {
  id: string;
  student: string;
  tutor: string;
  subject: string;
  date: string;
  amount: number;
  amountPaid: number | null;
  txn: string | null;
  receiptName: string | null;
  receiptFileId: string | null;
  at: string | null;
  status: PaymentStatus;
}
const PAY_LABEL: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' }> = {
  for_review: { label: 'For review', tone: 'warn' },
  paid: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
};

export function AdminPayments() {
  const q = useApi<{ payments: PaymentRow[] }>('/admin/payments');
  const [filter, setFilter] = useState<'for_review' | 'paid' | 'rejected' | 'all'>('for_review');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const { run, error } = useAction();
  const toast = useToast();
  const openFile = useOpenFile();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const all = q.data.payments;
  const list = all.filter((p) => filter === 'all' || p.status === filter);
  const approve = async (p: PaymentRow) => {
    const r = await run(() => api<{ tutor: string }>(`/admin/payments/${p.id}`, { body: { approve: true } }));
    if (r) toast(`Payment approved. ${r.tutor} now sees this session as paid.`);
  };
  const reject = (p: PaymentRow) =>
    setConfirm({
      title: 'Reject this payment?',
      body: 'The student will be asked to upload a new receipt.',
      yes: 'Reject payment',
      action: attempt(() => api(`/admin/payments/${p.id}`, { body: { approve: false } }), () => toast('Payment rejected.')),
    });
  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Payments" sub="Match each receipt’s PayPal transaction ID and amount before approving. The tutor sees the session as paid once you approve." />
      <Seg
        label="Payment status"
        value={filter}
        onChange={setFilter}
        options={(['for_review', 'paid', 'rejected', 'all'] as const).map((k) => ({ value: k, label: `${k === 'all' ? 'All' : PAY_LABEL[k].label} · ${k === 'all' ? all.length : all.filter((p) => p.status === k).length}` }))}
      />
      <ErrorBox error={error} />
      <div className="card card-clip">
        {!list.length ? (
          <p className="muted" style={{ padding: 24, textAlign: 'center' }}>Nothing here.</p>
        ) : (
          <div className="table-scroll">
            <table className="table hover">
              <thead><tr><th>Student → tutor</th><th>Session</th><th>Due</th><th>PayPal transaction</th><th>Receipt</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.map((p) => {
                  const short = p.amountPaid != null && p.amountPaid < p.amount;
                  const lab = PAY_LABEL[p.status];
                  return (
                    <tr key={p.id}>
                      <td><div className="row"><Avatar name={p.student} size={30} /><div><div style={{ fontWeight: 600 }}>{p.student}</div><div className="muted" style={{ fontSize: 12 }}>to {p.tutor}</div></div></div></td>
                      <td><div>{p.subject} · {fmtDate(p.date)}</div><div className="muted" style={{ fontSize: 12 }}>{p.at ? `Uploaded ${fmtStamp(p.at)}` : ''}</div></td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{peso(p.amount)}</div>
                        {short && <div className="row" style={{ gap: 4, fontSize: 12, color: 'var(--t-bad-fg)' }}><Icon name="warning" />Receipt shows {peso(p.amountPaid!)}</div>}
                      </td>
                      <td style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{p.txn ?? '—'}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 7, maxWidth: 180 }} onClick={() => openFile(p.receiptFileId, p.receiptName)}>
                          <Icon name="paperclip" /><span className="ellipsis">{p.receiptName ?? '—'}</span>
                        </button>
                      </td>
                      <td>{lab && <Tag tone={lab.tone} size="sm">{lab.label}</Tag>}</td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        {p.status === 'for_review' && (
                          <>
                            <button className="btn btn-primary btn-xs" onClick={() => approve(p)}>Approve</button>{' '}
                            <button className="btn btn-secondary btn-xs" onClick={() => reject(p)}>Reject</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirm && <ConfirmModal spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

type AdminReview = ReviewView & { attention: boolean };
const FB_FILTERS = [
  { value: 'attention', label: 'Needs attention', match: (r: AdminReview) => r.attention },
  { value: 'all', label: 'All', match: () => true },
  { value: 'anon', label: 'Anonymous', match: (r: AdminReview) => r.anonymous },
  { value: 'hidden', label: 'Hidden', match: (r: AdminReview) => r.hidden },
] as const;

export function AdminFeedback() {
  const q = useApi<{ reviews: AdminReview[] }>('/admin/reviews');
  const [filter, setFilter] = useState<(typeof FB_FILTERS)[number]['value']>('attention');
  const { run, error } = useAction();
  const toast = useToast();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const all = q.data.reviews;
  const f = FB_FILTERS.find((x) => x.value === filter)!;
  const list = all.filter(f.match).slice(0, 60);
  const act = async (r: AdminReview, action: 'reviewed' | 'hide' | 'warn') => {
    if (!(await run(() => api(`/admin/reviews/${r.id}/action`, { body: { action } })))) return;
    toast(action === 'reviewed' ? 'Marked as reviewed.' : action === 'warn' ? `Warning sent to ${r.tutor}.` : r.hidden ? 'Review restored to the tutor’s profile.' : 'Review hidden from the tutor’s profile.');
  };
  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Feedback" sub="Anonymous reviews hide the author from tutors and students. You can still see who wrote them." />
      <Seg label="Filter reviews" value={filter} onChange={setFilter} options={FB_FILTERS.map((x) => ({ value: x.value, label: `${x.label} · ${all.filter(x.match).length}` }))} />
      <ErrorBox error={error} />
      <div className="card card-clip">
        {!list.length && <p className="muted" style={{ padding: 24, textAlign: 'center' }}>Nothing needs attention.</p>}
        <div className="divided">
          {list.map((r) => {
            const st = REVIEW[r.status];
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, padding: '14px 18px', alignItems: 'start' }} className="stack-md">
                <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                  <Avatar name={r.author ?? 'Former user'} size={34} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 700 }}>{r.author}{r.authorRole === 'parent' ? ' (parent)' : ''}</span>
                      {r.anonymous && <Tag tone="neutral" size="sm" icon="eye-slash">Posted anonymously</Tag>}
                      <span className="muted">on</span>
                      <span style={{ fontWeight: 600 }}>{r.tutor}</span>
                      <span style={{ color: 'var(--cl-6)' }}>{stars(r.rating)}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{fmtDate(r.date)}</span>
                    </div>
                    <p className="pretty" style={{ fontSize: 14 }}>{r.comment}</p>
                    <div className="row" style={{ gap: 8 }}>
                      <Tag tone={st.tone} size="sm">{st.label}</Tag>
                      <span className="muted" style={{ fontSize: 12 }}>{r.note}</span>
                    </div>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  {r.status === 'new' && <button className="btn btn-secondary btn-xs" onClick={() => act(r, 'reviewed')}>Mark reviewed</button>}
                  <button className="btn btn-secondary btn-xs" onClick={() => act(r, 'hide')}>{r.hidden ? 'Unhide' : 'Hide'}</button>
                  <button className="btn btn-warn btn-xs" onClick={() => act(r, 'warn')}>Warn tutor</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
