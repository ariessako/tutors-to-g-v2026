import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Me } from '../../../shared/types';
import { validateProfile } from '../../../shared/matching';
import { fmtDate, fmtStamp, fmtTime, hoursLabel, stars } from '../../../shared/format';
import { SUBJECTS } from '../../../shared/vocab';
import { api, useAction, useApi } from '../api';
import { SESSION } from '../labels';
import { ProfileFields, readProfile, readTutor } from '../ProfileFields';
import type { ReviewView, SessionView } from '../types';
import { Avatar, CardHead, DateTile, ErrorBox, Field, Icon, Loading, Modal, PageHead, Stat, Tag, useToast } from '../ui';
import { PayTag, StudentModals, type StudentModal } from './Student';

export function Profile({ me }: { me: Me }) {
  const tutor = me.role === 'teacher';
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  const home = useApi<{ cluster: { no: number; name: string } | null }>(tutor ? null : '/student/home');
  const cl = home.data?.cluster;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const profile = readProfile(fd);
    const err = validateProfile(profile);
    if (err) return setError(err);
    const body = {
      name: String(fd.get('name') ?? me.name).trim() || me.name,
      profile,
      ...(tutor ? { tutor: readTutor(fd) } : { gradeLabel: String(fd.get('gradeLabel') ?? ''), school: String(fd.get('school') ?? '') }),
    };
    const r = await run(() => api<{ cluster: { no: number; count: number } | null }>('/me/profile', { method: 'PUT', body }));
    if (!r) return;
    toast(r.cluster ? `Saved. You’re now in Cluster ${r.cluster.no} with ${r.cluster.count} tutors.` : 'Profile saved.');
  }

  return (
    <section className="page" style={{ maxWidth: 920 }}>
      <PageHead
        title={tutor ? 'Your teaching profile' : 'Your learning profile'}
        sub={tutor ? 'Students are matched against this profile. Saving re-runs k-means right away.' : cl ? `You’re in Cluster ${cl.no}, “${cl.name}”. Saving re-runs k-means right away.` : undefined}
      />
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="card card-pad" style={{ gap: 14 }}>
          <h3 style={{ fontSize: 17 }}>Account</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Field label="Full name"><input className="input sm" name="name" defaultValue={me.name} autoComplete="name" /></Field>
            {!tutor && (
              <>
                <Field label="Grade or year"><input className="input sm" name="gradeLabel" defaultValue={me.gradeLabel ?? ''} /></Field>
                <Field label="School"><input className="input sm" name="school" defaultValue={me.school ?? ''} /></Field>
              </>
            )}
          </div>
        </div>
        <div className="card card-pad" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 8 }}><Icon name="circles-three-plus" style={{ fontSize: 20, color: 'var(--color-accent)' }} /><h3 style={{ fontSize: 17 }}>Matching profile</h3></div>
          <ProfileFields mode={tutor ? 'tutor' : 'student'} details={tutor} profile={me.profile} tutor={me.tutor} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" style={{ height: 40, padding: '0 18px' }} disabled={busy}><Icon name="arrows-clockwise" />Save and re-run matching</button>
        </div>
      </form>
    </section>
  );
}

interface GroupsResponse {
  invites: { groupId: string; name: string; by: string; members: number }[];
  mine: { id: string; name: string; description: string; subject: string; isOwner: boolean; faces: string[]; members: number; threads: number }[];
}

export function Groups() {
  const q = useApi<GroupsResponse>('/groups');
  const [creating, setCreating] = useState(false);
  const { run } = useAction();
  const toast = useToast();
  const nav = useNavigate();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const { invites, mine } = q.data;
  const respond = async (gid: string, name: string, accept: boolean) => {
    if (await run(() => api(`/groups/${gid}/respond`, { body: { accept } }))) toast(accept ? `You joined ${name}.` : 'Invitation declined.');
  };
  return (
    <section className="page">
      <PageHead title="Groups" sub="Study groups for students and tutors. Owners and members can invite others and start discussions.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" />Create a group</button>
      </PageHead>
      {invites.length > 0 && (
        <div style={{ background: 'var(--color-accent-100)', border: '1px solid var(--color-accent-200)', borderRadius: 14, padding: '6px 8px' }}>
          {invites.map((i) => (
            <div key={i.groupId} className="row wrap" style={{ gap: 14, padding: '10px 12px' }}>
              <Icon name="envelope-open" style={{ fontSize: 22, color: 'var(--color-accent-700)' }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{i.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>Invited by {i.by} · {i.members} members</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => respond(i.groupId, i.name, true)}>Accept</button>
              <button className="btn btn-secondary btn-sm" onClick={() => respond(i.groupId, i.name, false)}>Decline</button>
            </div>
          ))}
        </div>
      )}
      {!mine.length && <div className="empty">You haven’t joined a group yet.</div>}
      <div className="card-grid">
        {mine.map((g) => (
          <article key={g.id} className="card card-hover" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={() => nav(`/groups/${g.id}`)}>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={g.name} size={44} square />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontSize: 18 }}><Link to={`/groups/${g.id}`} style={{ color: 'var(--color-text)', textDecoration: 'none' }}>{g.name}</Link></h4>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <Tag tone="accent" size="sm">{g.subject}</Tag>
                  <Tag tone="neutral" size="sm">{g.isOwner ? 'Owner' : 'Member'}</Tag>
                </div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>{g.description}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <div className="faces">{g.faces.map((f, i) => <Avatar key={i} name={f} size={28} />)}</div>
              <span className="muted" style={{ fontSize: 12 }}>{g.members} members · {g.threads} discussion{g.threads === 1 ? '' : 's'}</span>
            </div>
          </article>
        ))}
      </div>
      {creating && <NewGroupModal onClose={() => setCreating(false)} />}
    </section>
  );
}

function NewGroupModal({ onClose }: { onClose: () => void }) {
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  const nav = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (name.length < 3) return setError('Give the group a name.');
    const r = await run(() => api<{ id: string }>('/groups', { body: { name, description: String(fd.get('desc') ?? '').trim(), subject: fd.get('subject') } }));
    if (!r) return;
    onClose();
    nav(`/groups/${r.id}`);
    toast('Group created. Invite members to get started.');
  }
  return (
    <Modal onClose={onClose} label="Create a group">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="dialog-title">Create a group</div>
        <Field label="Group name"><input className="input" name="name" placeholder="e.g. Grade 9 Science Review" maxLength={80} /></Field>
        <Field label="Subject"><select className="input" name="subject">{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="What is it for?"><textarea className="input" name="desc" maxLength={500} /></Field>
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Create group</button>
        </div>
      </form>
    </Modal>
  );
}

interface GroupDetail {
  id: string;
  name: string;
  description: string;
  subject: string;
  isMember: boolean;
  members: { id: string; name: string; role: string | null; owner: boolean }[];
  pending: string[];
  threads: { id: string; title: string; author: string; replies: number; posts: { id: number; author: string; isTutor: boolean; at: string; text: string }[] }[];
}

export function Group() {
  const { id } = useParams();
  const q = useApi<{ group: GroupDetail }>(`/groups/${id}`);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [modal, setModal] = useState<'invite' | 'thread' | null>(null);
  const { run, error } = useAction();
  const nav = useNavigate();
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const g = q.data.group;
  const th = g.threads.find((t) => t.id === threadId) ?? g.threads[0];

  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const text = String(new FormData(f).get('text') ?? '').trim();
    if (!text || !th) return;
    if (await run(() => api(`/groups/${g.id}/threads/${th.id}/posts`, { body: { text } }))) f.reset();
  }

  return (
    <section className="page" style={{ gap: 18 }}>
      <div><button className="btn btn-ghost btn-sm" onClick={() => nav('/groups')}><Icon name="arrow-left" />All groups</button></div>
      <header className="page-head">
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-700)' }}>{g.subject} · {g.members.length} members</span>
          <h1>{g.name}</h1>
          <p>{g.description}</p>
        </div>
        {g.isMember && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setModal('invite')}><Icon name="user-plus" />Invite</button>
            <button className="btn btn-primary" onClick={() => setModal('thread')}><Icon name="chat-circle-text" />New discussion</button>
          </div>
        )}
      </header>
      <div className="grid stack-md" style={{ gridTemplateColumns: 'minmax(220px,1fr) minmax(0,2fr) 240px', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="section-label" style={{ padding: '8px 10px' }}>Discussions</div>
          {!g.threads.length && <p className="muted" style={{ padding: '8px 10px', fontSize: 13 }}>No discussions yet.</p>}
          {g.threads.map((t) => (
            <button key={t.id} onClick={() => setThreadId(t.id)} className="list-btn" aria-current={th?.id === t.id} style={{ alignItems: 'flex-start', padding: 10, borderRadius: 9, background: th?.id === t.id ? 'var(--color-accent-100)' : undefined }}>
              <Icon name="chats-circle" style={{ fontSize: 18, color: 'var(--color-accent)', marginTop: 1 }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                <span className="muted" style={{ fontSize: 12 }}>{t.author} · {t.replies} {t.replies === 1 ? 'reply' : 'replies'}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!th ? (
            <div className="muted" style={{ padding: 40, textAlign: 'center' }}>Start a discussion to get the group talking.</div>
          ) : (
            <>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 19 }}>{th.title}</h3>
                <div className="muted" style={{ fontSize: 12 }}>Started by {th.author}</div>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {th.posts.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: 12 }}>
                    <Avatar name={p.author} size={34} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{p.author}</span>
                        {p.isTutor && <span className="tag tag-accent" style={{ height: 18, padding: '0 7px', fontSize: 10, fontWeight: 700 }}>TUTOR</span>}
                        <span className="muted" style={{ fontSize: 12 }}>{fmtStamp(p.at)}</span>
                      </div>
                      <div className="pretty" style={{ padding: '10px 14px', borderRadius: '4px 12px 12px 12px', background: 'var(--color-surface-2)', fontSize: 14, whiteSpace: 'pre-wrap' }}>{p.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              {g.isMember && (
                <form onSubmit={reply} className="row" style={{ gap: 8, padding: '14px 20px', borderTop: '1px solid var(--color-border)' }}>
                  <input className="input" name="text" placeholder="Write a reply…" aria-label="Reply" maxLength={5000} />
                  <button type="submit" className="btn btn-primary" style={{ height: 40, padding: '0 14px' }}><Icon name="paper-plane-tilt" />Send</button>
                </form>
              )}
              {error && <div style={{ padding: '0 20px 14px' }}><ErrorBox error={error} /></div>}
            </>
          )}
        </div>
        <aside className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="section-label">Members</div>
          {g.members.map((u) => (
            <div key={u.id} className="row">
              <Avatar name={u.name} size={28} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{u.name}</div>
              <span className="muted" style={{ fontSize: 11 }}>{u.owner && 'Owner · '}{u.role === 'teacher' ? 'Tutor' : 'Student'}</span>
            </div>
          ))}
          {g.pending.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 8 }}>Invited</div>
              {g.pending.map((n) => <div key={n} className="muted" style={{ fontSize: 13 }}>{n}</div>)}
            </>
          )}
        </aside>
      </div>
      {modal === 'invite' && <InviteModal groupId={g.id} groupName={g.name} onClose={() => setModal(null)} />}
      {modal === 'thread' && <NewThreadModal groupId={g.id} onClose={() => setModal(null)} onCreated={setThreadId} />}
    </section>
  );
}

function InviteModal({ groupId, groupName, onClose }: { groupId: string; groupName: string; onClose: () => void }) {
  const q = useApi<{ people: { id: string; label: string }[] }>(`/groups/${groupId}/invitable`);
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const userId = String(new FormData(e.currentTarget).get('user') ?? '');
    if (!userId) return setError('Choose someone to invite.');
    const r = await run(() => api<{ name: string }>(`/groups/${groupId}/invites`, { body: { userId } }));
    if (!r) return;
    onClose();
    toast(`Invitation sent to ${r.name}.`);
  }
  return (
    <Modal onClose={onClose} label={`Invite to ${groupName}`}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="dialog-title">Invite to {groupName}</div>
        <Field label="Student or tutor">
          <select className="input" name="user" defaultValue="">
            <option value="">{q.data ? 'Choose a person' : 'Loading…'}</option>
            {q.data?.people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <p className="muted" style={{ fontSize: 13 }}>They’ll see the invitation on their Groups page and can accept or decline.</p>
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Send invitation</button>
        </div>
      </form>
    </Modal>
  );
}

function NewThreadModal({ groupId, onClose, onCreated }: { groupId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    const text = String(fd.get('text') ?? '').trim();
    if (!title || !text) return setError('Add a title and a first message.');
    const r = await run(() => api<{ id: string }>(`/groups/${groupId}/threads`, { body: { title, text } }));
    if (!r) return;
    onCreated(r.id);
    onClose();
    toast('Discussion started.');
  }
  return (
    <Modal onClose={onClose} label="Start a discussion">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="dialog-title">Start a discussion</div>
        <Field label="Title"><input className="input" name="title" placeholder="e.g. Tips for the periodical exam" maxLength={160} /></Field>
        <Field label="First message"><textarea className="input" name="text" maxLength={5000} /></Field>
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Post</button>
        </div>
      </form>
    </Modal>
  );
}

interface Progress {
  child: null | { id: string; name: string; gradeLabel: string | null; school: string | null };
  stats: { completed: number; hours: number; upcoming: number; tutors: number };
  sessions: SessionView[];
  tutors: { id: string; name: string; completed: number; rated: number | null }[];
  feedback: ReviewView[];
}

export function ParentProgress() {
  const q = useApi<Progress>('/parent/progress');
  const [modal, setModal] = useState<StudentModal | null>(null);
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  const p = q.data;
  if (!p.child) return <div className="empty">Your account isn’t linked to a student yet. Ask your child for the email they signed up with.</div>;
  const first = p.child.name.split(' ')[0];
  return (
    <section className="page">
      <header className="row" style={{ gap: 16 }}>
        <Avatar name={p.child.name} size={60} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontSize: 32 }}>{first}’s progress</h1>
          <p className="muted" style={{ fontSize: 15 }}>{[p.child.name, p.child.gradeLabel, p.child.school].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <div className="stat-grid">
        <Stat icon="check-circle" n={p.stats.completed} label="Sessions completed" />
        <Stat icon="clock" n={p.stats.hours} label="Hours of tutoring" />
        <Stat icon="calendar-check" n={p.stats.upcoming} label="Upcoming" />
        <Stat icon="chalkboard-teacher" n={p.stats.tutors} label="Tutors" />
      </div>
      <div className="grid stack-md" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)', alignItems: 'start' }}>
        <div className="card card-clip">
          <CardHead icon="calendar" title="Sessions" />
          {!p.sessions.length && <p className="muted" style={{ padding: 20 }}>No sessions yet.</p>}
          <div className="divided">
            {p.sessions.map((r) => {
              const st = SESSION[r.status];
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '12px 20px' }}>
                  <DateTile date={r.date} size="sm" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{r.subject} with {r.tutor}</div>
                    <div className="muted ellipsis" style={{ fontSize: 12 }}>{fmtTime(r.time)} · {hoursLabel(r.hours)} · {r.topic}</div>
                  </div>
                  <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <Tag tone={st.tone}>{st.label}</Tag>
                    {(r.status === 'accepted' || r.status === 'completed') && <PayTag x={r} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <CardHead icon="chalkboard-teacher" title={`${first}’s tutors`} />
            <div className="divided">
              {p.tutors.map((t) => (
                <div key={t.id} className="row" style={{ gap: 12, padding: '12px 20px' }}>
                  <Avatar name={t.name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{t.completed} completed session{t.completed === 1 ? '' : 's'}</div>
                    {t.rated && <div style={{ fontSize: 12, color: 'var(--color-accent-700)' }}>You rated ★ {t.rated}</div>}
                  </div>
                  <button className="btn btn-secondary btn-sm" disabled={!!t.rated || !t.completed} onClick={() => setModal({ type: 'rate', tutorId: t.id, tutorName: t.name })}><Icon name="star" />{t.rated ? 'Reviewed' : !t.completed ? 'After a completed session' : 'Feedback'}</button>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <CardHead icon="chat-circle-text" title="Your feedback" />
            {!p.feedback.length && <p className="muted" style={{ padding: '16px 20px', fontSize: 13 }}>You haven’t reviewed a tutor yet.</p>}
            <div className="divided">
              {p.feedback.map((f) => (
                <div key={f.id} style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{f.tutor}</span>
                    <span style={{ color: 'var(--cl-6)', fontSize: 12 }}>{stars(f.rating)}</span>
                    {f.anonymous && <Tag tone="neutral" size="sm">Anonymous</Tag>}
                  </div>
                  <p style={{ fontSize: 13 }}>{f.comment}</p>
                  <span className="muted" style={{ fontSize: 11 }}>{fmtDate(f.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <StudentModals modal={modal} onClose={() => setModal(null)} />
    </section>
  );
}
