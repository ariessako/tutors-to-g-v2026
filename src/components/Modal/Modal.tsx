import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../cx';

export interface ModalProps {
  /** Whether the modal is shown. */
  open: boolean;
  /** Called on Escape, the close button, or an overlay click. */
  onClose: () => void;
  title: ReactNode;
  /** Short text under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Actions pinned to the bottom, typically a cancel and a confirm Button. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Close when the dimmed overlay is clicked. Defaults to true. */
  closeOnOverlayClick?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  className,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="tt-modal__overlay"
      onMouseDown={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={cx('tt-modal', `tt-modal--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="tt-modal__header">
          <div className="tt-modal__heading">
            <h2 id={titleId} className="tt-modal__title">{title}</h2>
            {description && <p id={descId} className="tt-modal__description">{description}</p>}
          </div>
          <button type="button" className="tt-modal__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children && <div className="tt-modal__body">{children}</div>}
        {footer && <div className="tt-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
