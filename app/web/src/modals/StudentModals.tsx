import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { fmtDate, fmtTime, hoursLabel, peso } from '../../../shared/format';
import { SESSION_HOURS, SESSION_MODES } from '../../../shared/vocab';
import { api, ApiError, useAction, useApi } from '../api';
import type { SessionView } from '../types';
import { ErrorBox, Field, Icon, Loading, Modal, Seg, useToast } from '../ui';

interface BookingInfo {
  tutor: { id: string; name: string; rate: number };
  subjects: string[];
  slots: { date: string; slot: string; taken: boolean }[];
  learner: string;
}

export function BookModal({ tutorId, onClose }: { tutorId: string; onClose: () => void }) {
  const [hours, setHours] = useState<number>(1);
  const [selectedSlot, setSelectedSlot] = useState('');
  const path = `/tutors/${tutorId}/booking?hours=${hours}`;
  const q = useQuery({ queryKey: [path], queryFn: () => api<BookingInfo>(path), placeholderData: (previous) => previous });
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  const nav = useNavigate();
  const b = q.data;
  const first = b?.tutor.name.split(' ')[0];
  const loadingSlots = q.isFetching || q.isPlaceholderData;
  const validSlot = !!b?.slots.some((o) => !o.taken && `${o.date}|${o.slot}` === selectedSlot);

  useEffect(() => {
    if (b && !q.isPlaceholderData && !validSlot) setSelectedSlot('');
  }, [b, q.isPlaceholderData, validSlot]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const slot = selectedSlot;
    const topic = String(fd.get('topic') ?? '').trim();
    if (loadingSlots || q.error) return setError('Wait for the schedule to refresh and try again.');
    if (!slot || !validSlot) return setError('Choose a time slot.');
    if (topic.length < 5) return setError('Tell the tutor what you want to work on.');
    const [date, sl] = slot.split('|');
    const ok = await run(async () => {
      try {
        return await api('/sessions', {
          body: { tutorId, subject: fd.get('subject'), date, slot: sl, hours, mode: fd.get('mode'), topic, learner: String(fd.get('learner') ?? ''), guardian: String(fd.get('guardian') ?? '') },
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) await q.refetch();
        throw e;
      }
    });
    if (!ok) return;
    onClose();
    nav('/sessions');
    toast(`Request sent to ${b!.tutor.name}. You’ll pay once they accept.`);
  }

  return (
    <Modal onClose={onClose} width={580} label="Request a session">
      {!b ? (
        q.error ? <ErrorBox error={q.error.message} /> : <Loading />
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="dialog-title">Request a session with {b.tutor.name}</div>
          <div className="stack-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Subject">
              <select className="input" name="subject">
                {b.subjects.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Mode">
              <select className="input" name="mode">
                {SESSION_MODES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label={`Time slot from ${first}’s schedule`}>
            <select className="input" name="slot" value={validSlot ? selectedSlot : ''} onChange={(e) => setSelectedSlot(e.target.value)} disabled={loadingSlots || busy || !!q.error}>
              <option value="">Choose a slot</option>
              {b.slots.map((o) => (
                <option key={o.date + o.slot} value={`${o.date}|${o.slot}`} disabled={o.taken}>
                  {fmtDate(o.date)} · {fmtTime(o.slot.split(' ')[1])}{o.taken ? ' · booked' : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="muted" style={{ fontSize: 13 }}>This is a request. Your tutor checks for scheduling conflicts before confirming.</div>
          {loadingSlots && <div role="status" className="muted" style={{ fontSize: 13 }}>Loading the tutor’s schedule…</div>}
          {!loadingSlots && !q.error && !b.slots.some((o) => !o.taken) && <div style={{ fontSize: 13, color: 'var(--t-bad-fg)' }}>{first} has no open times in the next 7 days{b.slots.length ? ' for this duration' : ''}.</div>}
          {q.error && <ErrorBox error={q.error.message} />}
          <div className="field">
            <span className="label">Duration</span>
            <Seg label="Duration" value={hours} onChange={setHours} options={SESSION_HOURS.map((h) => ({ value: h, label: hoursLabel(h, true) }))} />
          </div>
          <div className="stack-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Learner name and grade"><input className="input" name="learner" defaultValue={b.learner} /></Field>
            <Field label="Parent or guardian contact (optional)"><input className="input" name="guardian" placeholder="Name · mobile number" /></Field>
          </div>
          <Field label="What do you want to work on?">
            <textarea className="input" name="topic" placeholder="e.g. Quadratic equations. Our quiz is on Friday." />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="muted">{peso(b.tutor.rate)} per hour × {hours}</span>
            <span className="head-font" style={{ fontSize: 26, fontWeight: 700 }}>{peso(b.tutor.rate * hours)}</span>
          </div>
          <ErrorBox error={error} />
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || loadingSlots || !!q.error || !validSlot}>Send request</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * Payment: the student pays outside the app by any method, then uploads the
 * receipt (with an optional reference number) for an admin to verify.
 */
export function PayModal({ session: x, onClose }: { session: SessionView; onClose: () => void }) {
  const rejected = x.payment.status === 'rejected';
  const [file, setFile] = useState<File | null>(null);
  const { run, error, setError, busy } = useAction();
  const toast = useToast();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const reference = String(fd.get('reference') ?? '').trim();
    const amount = Number(fd.get('amount'));
    if (!file) return setError('Attach your receipt.');
    if (!(amount > 0)) return setError('Enter the amount you paid.');
    const form = new FormData();
    form.set('receipt', file);
    form.set('reference', reference);
    form.set('amount', String(amount));
    if (!(await run(() => api(`/sessions/${x.id}/receipt`, { form })))) return;
    onClose();
    toast('Receipt submitted. An admin will confirm your payment.');
  }

  return (
    <Modal onClose={onClose} label="Pay for your session">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="dialog-title">Upload your receipt</div>
        {rejected && <div className="alert alert-bad"><Icon name="warning-circle" />Your last receipt was rejected. Upload a clearer copy or check the amount.</div>}
        <dl style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: '8px 16px', margin: 0, fontSize: 14 }}>
          <dt className="muted">Tutor</dt><dd style={{ margin: 0 }}>{x.tutor}</dd>
          <dt className="muted">Session</dt><dd style={{ margin: 0 }}>{x.subject} · {fmtDate(x.date)}, {fmtTime(x.time)}</dd>
          <dt className="muted">Duration</dt><dd style={{ margin: 0 }}>{hoursLabel(x.hours, true)}</dd>
          <dt className="muted">Amount due</dt><dd style={{ margin: 0, fontWeight: 700 }}>{peso(x.amount)}</dd>
        </dl>
        <p className="dialog-body">Upload the receipt for your payment. An admin checks it before the session is marked paid.</p>
        <Field label="Receipt (image or PDF, up to 10 MB)">
          <input className="input" type="file" accept="image/*,.pdf" style={{ padding: 6, height: 'auto' }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="stack-md" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <Field label="Reference number (optional)">
            <input className="input" name="reference" maxLength={40} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }} autoComplete="off" />
          </Field>
          <Field label="Amount paid (₱)">
            <input className="input" name="amount" type="number" min={1} step="any" defaultValue={x.amount} />
          </Field>
        </div>
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Submit for approval</button>
        </div>
      </form>
    </Modal>
  );
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function RateModal({ tutorId, tutorName, sessionId, onClose }: { tutorId: string; tutorName: string; sessionId?: string; onClose: () => void }) {
  const [stars, setStars] = useState(0);
  const { run, error, setError, busy } = useAction();
  const toast = useToast();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const comment = String(new FormData(e.currentTarget).get('comment') ?? '').trim();
    if (!stars) return setError('Choose a star rating.');
    if (comment.length < 4) return setError('Add a short comment.');
    if (!(await run(() => api('/reviews', { body: { tutorId, rating: stars, comment, sessionId } })))) return;
    onClose();
    toast(`Thanks. Your anonymous review is on ${tutorName.split(' ')[0]}’s profile.`);
  }

  return (
    <Modal onClose={onClose} width={500} label={`Rate ${tutorName}`}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="dialog-title">Rate {tutorName}</div>
        <div className="row" role="radiogroup" aria-label="Star rating" style={{ gap: 2 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className="btn btn-ghost btn-icon"
              style={{ fontSize: 30, width: 40, color: n <= stars ? 'var(--cl-6)' : 'var(--color-neutral-500)' }}
              onClick={() => setStars(n)}
            >
              {n <= stars ? '★' : '☆'}
            </button>
          ))}
          <span className="muted" style={{ marginLeft: 10 }}>{RATING_LABELS[stars] || 'Choose a rating'}</span>
        </div>
        <Field label="Comment">
          <textarea className="input" name="comment" placeholder="What worked, and what could be better?" />
        </Field>
        <p className="muted row" style={{ fontSize: 13, gap: 8 }}>
          <Icon name="eye-slash" />All reviews are anonymous. Your comment is shown, but your name is hidden from the tutor and other users. Admins can still see it.
        </p>
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Post review</button>
        </div>
      </form>
    </Modal>
  );
}
