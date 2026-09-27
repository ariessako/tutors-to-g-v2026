import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../cx';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  /** Bold first line. */
  title?: ReactNode;
  /** Replaces the default icon for the tone. Pass `null` to hide it. */
  icon?: ReactNode;
  /** Shows a close button that calls this handler. */
  onDismiss?: () => void;
  /** Buttons or links shown under the message. */
  actions?: ReactNode;
}

const ICON_PATHS: Record<NonNullable<AlertProps['tone']>, string> = {
  info: 'M12 8h.01M11 12h1v5h1',
  success: 'm8 12.5 2.5 2.5L16 9.5',
  warning: 'M12 8v5M12 16.5h.01',
  danger: 'M9 9l6 6M15 9l-6 6',
};

export function Alert({
  tone = 'info',
  title,
  icon,
  onDismiss,
  actions,
  className,
  children,
  ...rest
}: AlertProps) {
  const defaultIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" />
      <path d={ICON_PATHS[tone]} />
    </svg>
  );
  const shownIcon = icon === undefined ? defaultIcon : icon;

  return (
    <div
      className={cx('tt-alert', `tt-alert--${tone}`, className)}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      {...rest}
    >
      {shownIcon && <span className="tt-alert__icon" aria-hidden="true">{shownIcon}</span>}
      <div className="tt-alert__content">
        {title && <p className="tt-alert__title">{title}</p>}
        {children && <div className="tt-alert__message">{children}</div>}
        {actions && <div className="tt-alert__actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="tt-alert__dismiss" onClick={onDismiss} aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
