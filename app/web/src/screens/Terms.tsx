import { TERMS, TERMS_TITLE, TERMS_VERSION } from '../../../shared/terms';
import { Brand } from '../Shell';
import { Modal } from '../ui';

function TermsBody() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 14, lineHeight: 1.6 }}>
      <p className="muted" style={{ fontSize: 13 }}>Version {TERMS_VERSION}</p>
      {TERMS.map((s) => (
        <section key={s.heading} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h3 style={{ fontSize: 16 }}>{s.heading}</h3>
          {s.body.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
    </div>
  );
}

/** The terms as a public page at /terms. */
export function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Brand />
        <h1 style={{ fontSize: 34 }}>{TERMS_TITLE}</h1>
        <TermsBody />
      </div>
    </div>
  );
}

/** The terms in a dialog, for reading them during sign-up without losing the form. */
export function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={680} top label={TERMS_TITLE}>
      <div className="dialog-title">{TERMS_TITLE}</div>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 6 }}>
        <TermsBody />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
