import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBox, Modal } from '../ui';

export interface ConfirmSpec {
  title: string;
  body: string;
  yes: string;
  /** Resolves to an error message to keep the dialog open, or nothing to close it and refresh data. */
  action: () => Promise<string | void>;
}

export function ConfirmModal({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  async function go() {
    setBusy(true);
    const err = await spec.action();
    setBusy(false);
    if (err) return setError(err);
    await qc.invalidateQueries();
    onClose();
  }
  return (
    <Modal onClose={onClose} label={spec.title}>
      <div className="dialog-title">{spec.title}</div>
      <div className="dialog-body">{spec.body}</div>
      <ErrorBox error={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={go} disabled={busy}>{spec.yes}</button>
      </div>
    </Modal>
  );
}

/** Wraps an API call as a ConfirmSpec action: errors become the dialog's message. */
export const attempt =
  (fn: () => Promise<unknown>, after?: () => void) =>
  async (): Promise<string | void> => {
    try {
      await fn();
      after?.();
    } catch (e) {
      return e instanceof Error ? e.message : 'Something went wrong. Try again.';
    }
  };
