import { useState, type FormEvent } from 'react';
import type { Attendance, ReceiptStatus, SessionEventKind } from '../../../shared/types';
import { fmtDate, fmtStamp, fmtTime, hoursLabel, peso } from '../../../shared/format';
import { api, useAction } from '../api';
import type { SessionView } from '../types';
import { ErrorBox, Field, Icon, Modal, Seg, Tag, useToast } from '../ui';

export const ATTENDANCE: Record<Attendance, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  present: { label: 'Attended', tone: 'ok' },
  late: { label: 'Late', tone: 'warn' },
  no_show: { label: 'No-show', tone: 'bad' },
};

const RECEIPT: Record<ReceiptStatus, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  for_review: { label: 'Under review', tone: 'warn' },
  approved: { label: 'Received', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
};

const EVENT: Record<SessionEventKind, { label: string; icon: string }> = {
  requested: { label: 'Requested', icon: 'paper-plane-tilt' },
  accepted: { label: 'Accepted by tutor', icon: 'check' },
  declined: { label: 'Declined by tutor', icon: 'x' },
  auto_declined: { label: 'Declined automatically', icon: 'x' },
  receipt_uploaded: { label: 'Receipt uploaded', icon: 'receipt' },
  payment_approved: { label: 'Payment received', icon: 'check-circle' },
  payment_rejected: { label: 'Payment rejected', icon: 'x-circle' },
  completed: { label: 'Completed', icon: 'flag-checkered' },
};

/** The tutor closes a session with its log. */
export function CompleteModal({ session: x, onClose }: { session: SessionView; onClose: () => void }) {
  const [attendance, setAttendance] = useState<Attendance>('present');
  const { run, error, setError, busy } = useAction();
  const toast = useToast();
  const lengths = [0.5, 1, 1.5, 2, 2.5, 3];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const topics = String(fd.get('topics') ?? '').trim();
    if (attendance !== 'no_show' && topics.length < 3) return setError('Add the topics you covered.');
    const body = { attendance, actualHours: attendance === 'no_show' ? 0 : Number(fd.get('actualHours')), topics, notes: String(fd.get('notes') ?? '').trim() };
    if (!(await run(() => api(`/sessions/${x.id}/complete`, { body })))) return;
    onClose();
    toast(attendance === 'no_show' ? 'Logged as a no-show.' : 'Session logged and completed. The student can now rate it.');
  }

  return (
    <Modal onClose={onClose} width={540} label="Complete session">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="dialog-title">Log and complete this session</div>
        <p className="muted" style={{ fontSize: 13 }}>{x.learner} · {x.subject} · {fmtDate(x.date)}, {fmtTime(x.time)} · {hoursLabel(x.hours)} booked</p>
        <div className="field">
          <span className="label">Attendance</span>
          <Seg label="Attendance" value={attendance} onChange={setAttendance} options={(Object.keys(ATTENDANCE) as Attendance[]).map((k) => ({ value: k, label: ATTENDANCE[k].label }))} />
        </div>
        {attendance !== 'no_show' && (
          <>
            <Field label="Actual length">
              <select className="input" name="actualHours" defaultValue={String(x.hours)}>
                {lengths.map((h) => <option key={h} value={h}>{hoursLabel(h, true)}</option>)}
              </select>
            </Field>
            <Field label="Topics covered">
              <textarea className="input" name="topics" defaultValue={x.topic} placeholder="What you worked on" />
            </Field>
          </>
        )}
        <Field label="Notes or homework (shared with the student and their parents)">
          <textarea className="input" name="notes" placeholder={attendance === 'no_show' ? 'e.g. Waited 20 minutes; no reply on Meet.' : 'e.g. Homework: worksheet 3, items 1–10.'} />
        </Field>
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Complete session</button>
        </div>
      </form>
    </Modal>
  );
}

/** A session's log and timeline, for students, parents, tutors and admins. */
export function SessionDetailsModal({ session: x, onClose }: { session: SessionView; onClose: () => void }) {
  const log = x.log;
  return (
    <Modal onClose={onClose} width={560} label="Session details">
      <div className="dialog-title">{x.subject} with {x.tutor}</div>
      <p className="muted" style={{ fontSize: 13 }}>{x.learner} · {fmtDate(x.date)}, {fmtTime(x.time)} · {hoursLabel(x.hours)} · {x.mode}</p>
      {log ? (
        <div className="card card-pad" style={{ gap: 8, background: 'var(--color-surface-2)', boxShadow: 'none' }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <strong>Session log</strong>
            {log.attendance && <Tag tone={ATTENDANCE[log.attendance].tone} size="sm">{ATTENDANCE[log.attendance].label}</Tag>}
            {log.actualHours != null && log.attendance !== 'no_show' && <span className="muted" style={{ fontSize: 12 }}>{hoursLabel(log.actualHours, true)}</span>}
          </div>
          {log.topics && <div style={{ fontSize: 14 }}><span className="muted">Topics covered: </span>{log.topics}</div>}
          {log.notes && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}><span className="muted">Notes: </span>{log.notes}</div>}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>The tutor logs attendance and topics when the session is completed.</p>
      )}
      {(x.status === 'accepted' || x.status === 'completed') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Payments</strong>
            <span className="muted" style={{ fontSize: 12 }}>{peso(x.payment.paid)} of {peso(x.amount)} received{x.payment.planParts > 1 ? ` · up to ${x.payment.planParts} installments` : ''}</span>
          </div>
          {!x.payment.receipts.length && <p className="muted" style={{ fontSize: 13 }}>No receipts uploaded yet.</p>}
          {x.payment.receipts.map((r) => (
            <div key={r.id} className="row wrap" style={{ gap: 10, fontSize: 13 }}>
              <Tag tone={RECEIPT[r.status].tone} size="sm">{RECEIPT[r.status].label}</Tag>
              <span style={{ flex: 1 }}>{x.payment.planParts > 1 ? `Installment ${r.part} · ` : ''}{peso(r.amount)} · uploaded {fmtStamp(r.uploadedAt)}{r.reviewedAt ? ` · reviewed ${fmtStamp(r.reviewedAt)}` : ''}</span>
              {r.status === 'approved' && <a className="link" href={`/api/payments/${r.id}/acknowledgment.pdf`} download>Acknowledgment</a>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <strong style={{ fontSize: 14 }}>Timeline</strong>
        {!x.events.length && <p className="muted" style={{ fontSize: 13 }}>No events recorded.</p>}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {x.events.map((e, i) => (
            <li key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <span className="icon-tile" style={{ width: 28, height: 28, fontSize: 14, flexShrink: 0 }}><Icon name={EVENT[e.kind]?.icon ?? 'dot'} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{EVENT[e.kind]?.label ?? e.kind}{e.detail ? ` · ${e.detail}` : ''}</div>
                <div className="muted" style={{ fontSize: 12 }}>{fmtStamp(e.at)}{e.by ? ` · ${e.by}` : ''}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
