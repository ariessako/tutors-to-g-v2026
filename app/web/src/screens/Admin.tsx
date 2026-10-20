import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { AppStatus, PaymentStatus, Profile, TutorDetails } from '../../../shared/types';
import { validateProfile } from '../../../shared/matching';
import { WARNING_LIMIT } from '../../../shared/vocab';
import { fmtDate, fmtStamp, fmtTime, peso, stars } from '../../../shared/format';
import { api, useAction, useApi } from '../api';
import { APPLICATION, LINK, PAYMENT, REVIEW, SESSION, type LinkView } from '../labels';
import { ATTENDANCE, SessionDetailsModal } from '../modals/SessionModals';
import { attempt, ConfirmModal, type ConfirmSpec } from '../modals/Confirm';
import { ProfileFields, readProfile, readTutor } from '../ProfileFields';
import type { ReviewView, SessionView } from '../types';
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
  counts: { applications: number; payments: number; feedback: number; parentLinks: number; warningsSent: number; warningsActive: number; banned: number; active: number; deactivated: number };
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
    { n: c.payments, icon: 'receipt', label: 'Payments to approve', sub: 'Receipts uploaded by students', to: '/admin/payments' },
    { n: c.feedback, icon: 'chat-circle-text', label: 'Feedback to check', sub: 'New ratings of 3 stars or lower', to: '/admin/feedback' },
    { n: c.parentLinks, icon: 'link', label: 'Parent links to verify', sub: 'Confirmed by the student', to: '/admin/parent-links' },
    { n: c.active, icon: 'users', label: 'Active accounts', sub: `${c.deactivated} inactive · ${c.banned} banned`, to: '/admin/accounts' },
    { n: c.warningsSent, icon: 'warning', label: 'Warnings sent', sub: `${c.warningsActive} still active`, to: '/admin/accounts' },
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
  termsVersion: string | null;
  termsAcceptedAt: string | null;
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
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
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
    const done = () => toast(`${a.name}: ${APPLICATION[status].label}.${status === 'approved' ? ' They now appear in matches.' : ''}`);
    const update = () => api(`/admin/applications/${a.id}/status`, { body: { status, note } });
    // Rejecting or sending back an application is confirmed first; the applicant sees the note.
    if (status === 'rejected' || status === 'needs_changes')
      return setConfirm({
        title: status === 'rejected' ? `Reject ${a.name}’s application?` : `Request changes from ${a.name}?`,
        body: status === 'rejected'
          ? `${a.name} won’t be able to tutor unless the application is reopened. They’ll see your note: “${note}”`
          : `The application goes back to ${a.name} to fix and resubmit. They’ll see your note: “${note}”`,
        yes: status === 'rejected' ? 'Reject application' : 'Request changes',
        action: attempt(update, done),
      });
    if (await run(update)) done();
  }

  const facts = [
    ['Subjects', p ? `${p.subjects.join(', ')} · ${p.grades.join(', ')}` : '—'],
    ['Curriculum', a.curricula.join(', ') || '—'],
    ['Lesson approach', a.method || '—'],
    ['Teaches best', p?.learning || '—'],
    ['Hobbies', [p?.hobbies.join(', '), p?.interests].filter(Boolean).join(' · ') || '—'],
    ['Rate', `${peso(a.rate)}/hr`],
    ['Terms', a.termsVersion ? `Accepted version ${a.termsVersion}${a.termsAcceptedAt ? ` on ${fmtStamp(a.termsAcceptedAt)}` : ''}` : 'Not accepted'],
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
      {confirm && <ConfirmModal spec={confirm} onClose={() => setConfirm(null)} />}
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

interface AccountRow { id: string; name: string; email: string; role: 'student' | 'teacher' | 'parent'; joined: string; status: 'active' | 'deactivated' | 'banned'; warnings: number }
const ACCOUNT_STATUS = { active: { label: 'Active', tone: 'ok' }, deactivated: { label: 'Deactivated', tone: 'bad' }, banned: { label: 'Banned', tone: 'bad' } } as const;

interface WarningHistory {
  limit: number;
  status: AccountRow['status'];
  active: number;
  warnings: { id: string; reason: string; at: string; active: boolean; removedAt: string | null; issuedBy: string | null; removedBy: string | null }[];
}

/** A user's warning history, with the form to issue another. */
function WarningsModal({ user: u, onClose }: { user: AccountRow; onClose: () => void }) {
  const q = useApi<WarningHistory>(`/admin/users/${u.id}/warnings`);
  const { run, error, setError, busy } = useAction();
  const [formKey, setFormKey] = useState(0);
  const toast = useToast();
  const h = q.data;
  async function issue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    if (reason.length < 5) return setError('Say why you’re warning this user.');
    const r = await run(() => api<{ count: number; banned: boolean; limit: number }>(`/admin/users/${u.id}/warnings`, { body: { reason } }));
    if (!r) return;
    setFormKey(formKey + 1);
    toast(r.banned ? `${u.name} reached ${r.limit} warnings and is now banned.` : `Warning ${r.count} of ${r.limit} sent to ${u.name}.`);
  }
  const remove = async (id: string) => {
    if (await run(() => api(`/admin/warnings/${id}/remove`, { method: 'POST' }))) toast('Warning removed.');
  };
  const next = (h?.active ?? 0) + 1;
  return (
    <Modal onClose={onClose} width={580} label={`Warnings for ${u.name}`}>
      <div className="dialog-title">Warnings for {u.name}</div>
      {!h ? (
        q.error ? <ErrorBox error={q.error.message} /> : <Loading />
      ) : (
        <>
          <div className="row wrap" style={{ gap: 8 }}>
            <Tag tone={h.active >= h.limit ? 'bad' : h.active ? 'warn' : 'neutral'}>{h.active} of {h.limit} active</Tag>
            <Tag tone={ACCOUNT_STATUS[h.status].tone}>{ACCOUNT_STATUS[h.status].label}</Tag>
            <span className="muted" style={{ fontSize: 12 }}>{h.warnings.length} sent in total</span>
          </div>
          {h.status === 'banned' && <div className="alert alert-bad"><Icon name="prohibit" />Banned. Remove warnings below the limit, then reactivate the account from the list to lift the ban.</div>}
          <div className="divided" style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 10 }}>
            {!h.warnings.length && <p className="muted" style={{ padding: 14, fontSize: 13 }}>No warnings yet.</p>}
            {h.warnings.map((w) => (
              <div key={w.id} className="row" style={{ gap: 10, padding: '10px 14px', alignItems: 'flex-start', opacity: w.active ? 1 : 0.6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, textDecoration: w.active ? 'none' : 'line-through' }}>{w.reason}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{fmtStamp(w.at)}{w.issuedBy ? ` · by ${w.issuedBy}` : ''}{w.removedAt ? ` · removed ${fmtStamp(w.removedAt)}${w.removedBy ? ` by ${w.removedBy}` : ''}` : ''}</div>
                </div>
                {w.active && <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => remove(w.id)}>Remove</button>}
              </div>
            ))}
          </div>
          {h.status !== 'banned' && (
            <form key={formKey} onSubmit={issue} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label={`Issue warning ${next} of ${h.limit}${next >= h.limit ? ' (this bans the account)' : ''}`}>
                <textarea className="input" name="reason" placeholder="What rule was broken? The user sees this reason." />
              </Field>
              <ErrorBox error={error} />
              <div className="dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                <button type="submit" className={`btn ${next >= h.limit ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{next >= h.limit ? 'Warn and ban' : 'Send warning'}</button>
              </div>
            </form>
          )}
          {h.status === 'banned' && <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Close</button></div>}
        </>
      )}
    </Modal>
  );
}
const ROLE_NAMES = { student: 'Student', teacher: 'Tutor', parent: 'Parent' } as const;

export function AdminAccounts() {
  const [role, setRole] = useState<'all' | AccountRow['role']>('all');
  const [q, setQ] = useState('');
  const res = useApi<{ total: number; users: AccountRow[] }>(`/admin/users?role=${role}&q=${encodeURIComponent(q)}`);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [warning, setWarning] = useState<AccountRow | null>(null);
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
    else if (u.status === 'banned')
      setConfirm({
        title: `Lift ${u.name}’s ban?`,
        body: `They can sign in again. ${u.warnings ? `They still have ${u.warnings} active warning${u.warnings > 1 ? 's' : ''}; the next warning bans them again unless you remove some first.` : ''}`,
        yes: 'Lift ban',
        action: attempt(() => api(`/admin/users/${u.id}/status`, { body: { status: 'active' } }), () => toast(`${u.name}’s ban was lifted.`)),
      });
    else void run(() => api(`/admin/users/${u.id}/status`, { body: { status: 'active' } })).then((r) => r && toast(`${u.name} was reactivated.`));
  };

  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Accounts" sub="Deactivated and banned accounts can’t log in and are left out of k-means clustering. Three active warnings ban an account automatically." />
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
              <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Joined</th><th>Status</th><th>Warnings</th><th /></tr></thead>
              <tbody>
                {d.users.map((u) => {
                  const act = u.status === 'active';
                  return (
                    <tr key={u.id}>
                      <td><div className="row"><Avatar name={u.name} size={30} /><span style={{ fontWeight: 600 }}>{u.name}</span></div></td>
                      <td>{ROLE_NAMES[u.role]}</td>
                      <td className="muted">{u.email}</td>
                      <td>{fmtDate(u.joined)}</td>
                      <td><Tag tone={ACCOUNT_STATUS[u.status].tone} size="sm">{ACCOUNT_STATUS[u.status].label}</Tag></td>
                      <td><button className="btn btn-ghost btn-xs" onClick={() => setWarning(u)}><Tag tone={u.warnings >= WARNING_LIMIT ? 'bad' : u.warnings ? 'warn' : 'neutral'} size="sm">{u.warnings} / {WARNING_LIMIT}</Tag></button></td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => setWarning(u)}>Warn</button>{' '}
                        <button className={`btn btn-xs ${act ? 'btn-danger' : 'btn-primary'}`} onClick={() => toggle(u)}>{act ? 'Deactivate' : u.status === 'banned' ? 'Lift ban' : 'Reactivate'}</button>
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
      {warning && <WarningsModal user={warning} onClose={() => setWarning(null)} />}
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
  reference: string | null;
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
      <PageHead title="Payments" sub="Check each receipt’s amount and reference number before approving. The tutor sees the session as paid once you approve." />
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
              <thead><tr><th>Student → tutor</th><th>Session</th><th>Due</th><th>Reference no.</th><th>Receipt</th><th>Status</th><th /></tr></thead>
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
                      <td style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{p.reference ?? '—'}</td>
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

const SESSION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'accepted', label: 'Upcoming' },
  { value: 'pending', label: 'Requested' },
  { value: 'declined', label: 'Declined' },
] as const;

/** Every session with its log, filterable by status and date, exportable as CSV. */
export function AdminSessions() {
  const [status, setStatus] = useState<(typeof SESSION_FILTERS)[number]['value']>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [details, setDetails] = useState<SessionView | null>(null);
  const qs = new URLSearchParams({ ...(status !== 'all' && { status }), ...(from && { from }), ...(to && { to }) }).toString();
  const q = useApi<{ sessions: SessionView[] }>(`/admin/sessions${qs ? `?${qs}` : ''}`);
  const list = q.data?.sessions ?? [];
  const done = list.filter((s) => s.log);
  const noShows = done.filter((s) => s.log?.attendance === 'no_show').length;
  const hours = done.reduce((n, s) => n + (s.log?.actualHours ?? 0), 0);
  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Sessions" sub="Every tutorial session with its timeline and the tutor’s log of attendance, topics and notes.">
        <a className="btn btn-secondary" href={`/api/admin/sessions.csv${qs ? `?${qs}` : ''}`} download><Icon name="download-simple" />Export CSV</a>
      </PageHead>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
        <Seg label="Session status" value={status} onChange={setStatus} options={SESSION_FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
        <Field label="From"><input className="input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {q.data && (
        <div className="muted" style={{ fontSize: 13 }}>
          {list.length} session{list.length === 1 ? '' : 's'} · {done.length} logged · {hours} hour{hours === 1 ? '' : 's'} taught · {noShows} no-show{noShows === 1 ? '' : 's'}
        </div>
      )}
      <div className="card card-clip">
        {!q.data ? (
          q.error ? <ErrorBox error={q.error.message} /> : <Loading />
        ) : !list.length ? (
          <p className="muted" style={{ padding: 24, textAlign: 'center' }}>No sessions match.</p>
        ) : (
          <div className="table-scroll">
            <table className="table hover">
              <thead><tr><th>Date</th><th>Student → tutor</th><th>Subject</th><th>Status</th><th>Attendance</th><th>Payment</th><th /></tr></thead>
              <tbody>
                {list.map((s) => {
                  const st = SESSION[s.status];
                  const pay = PAYMENT[s.payment.status];
                  return (
                    <tr key={s.id}>
                      <td className="nowrap">{fmtDate(s.date)} · {fmtTime(s.time)}</td>
                      <td><div style={{ fontWeight: 600 }}>{s.learner}</div><div className="muted" style={{ fontSize: 12 }}>to {s.tutor}</div></td>
                      <td><div>{s.subject}</div><div className="muted ellipsis" style={{ fontSize: 12, maxWidth: 240 }}>{s.log?.topics || s.topic}</div></td>
                      <td><Tag tone={st.tone} size="sm">{st.label}</Tag></td>
                      <td>{s.log?.attendance ? <Tag tone={ATTENDANCE[s.log.attendance].tone} size="sm">{ATTENDANCE[s.log.attendance].label}</Tag> : '—'}</td>
                      <td><Tag tone={pay.tone} size="sm">{pay.label}</Tag></td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-xs" onClick={() => setDetails(s)}>Details</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {details && <SessionDetailsModal session={details} onClose={() => setDetails(null)} />}
    </section>
  );
}

const LINK_FILTERS = [
  { value: 'pending_admin', label: 'To verify' },
  { value: 'pending_student', label: 'Waiting for student' },
  { value: 'approved', label: 'Linked' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
] as const;

export function AdminParentLinks() {
  const q = useApi<{ links: LinkView[] }>('/admin/parent-links');
  const [filter, setFilter] = useState<(typeof LINK_FILTERS)[number]['value']>('pending_admin');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const { run, error } = useAction();
  const toast = useToast();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const all = q.data.links;
  const list = all.filter((l) => filter === 'all' || l.status === filter);
  const approve = async (l: LinkView) => {
    if (await run(() => api(`/admin/parent-links/${l.id}`, { body: { approve: true } }))) toast(`${l.parent.name} can now follow ${l.student.name}.`);
  };
  const reject = (l: LinkView) =>
    setConfirm({
      title: 'Reject this link?',
      body: `${l.parent.name} won’t see ${l.student.name}’s sessions. They can send a new request.`,
      yes: 'Reject link',
      action: attempt(() => api(`/admin/parent-links/${l.id}`, { body: { approve: false } }), () => toast('Link rejected.')),
    });
  return (
    <section className="page" style={{ gap: 18 }}>
      <PageHead title="Parent links" sub="Each request is confirmed by the student first. Verify the parent before approving; they then see the student’s sessions and progress." />
      <Seg
        label="Link status"
        value={filter}
        onChange={setFilter}
        options={LINK_FILTERS.map((f) => ({ value: f.value, label: `${f.label} · ${f.value === 'all' ? all.length : all.filter((l) => l.status === f.value).length}` }))}
      />
      <ErrorBox error={error} />
      <div className="card card-clip">
        {!list.length ? (
          <p className="muted" style={{ padding: 24, textAlign: 'center' }}>Nothing here.</p>
        ) : (
          <div className="table-scroll">
            <table className="table hover">
              <thead><tr><th>Parent</th><th>Student</th><th>Requested</th><th>Student confirmed</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.map((l) => {
                  const st = LINK[l.status];
                  return (
                    <tr key={l.id}>
                      <td><div className="row"><Avatar name={l.parent.name} size={30} /><div><div style={{ fontWeight: 600 }}>{l.parent.name}</div><div className="muted" style={{ fontSize: 12 }}>{l.parent.email}</div></div></div></td>
                      <td><div style={{ fontWeight: 600 }}>{l.student.name}</div><div className="muted" style={{ fontSize: 12 }}>{[l.student.gradeLabel, l.student.email].filter(Boolean).join(' · ')}</div></td>
                      <td className="nowrap">{fmtStamp(l.requestedAt)}</td>
                      <td className="nowrap">{l.studentAt && !(l.status === 'declined' && l.declinedBy === 'student') ? fmtStamp(l.studentAt) : '—'}</td>
                      <td><Tag tone={st.tone} size="sm">{l.status === 'declined' ? `Declined by ${l.declinedBy === 'admin' ? 'admin' : 'student'}` : st.label}</Tag></td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        {l.status === 'pending_admin' && (
                          <>
                            <button className="btn btn-primary btn-xs" onClick={() => approve(l)}>Approve</button>{' '}
                            <button className="btn btn-secondary btn-xs" onClick={() => reject(l)}>Reject</button>
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
      <PageHead title="Feedback" sub="All reviews are anonymous to tutors, students and parents. You can still see who wrote them." />
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
