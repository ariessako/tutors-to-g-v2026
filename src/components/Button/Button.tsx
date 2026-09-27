import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `primary` is the main call to action; use one per view. */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Stretches the button to fill its container. */
  fullWidth?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Icon shown before the label. */
  leftIcon?: ReactNode;
  /** Icon shown after the label. */
  rightIcon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'tt-button',
        `tt-button--${variant}`,
        `tt-button--${size}`,
        fullWidth && 'tt-button--full',
        loading && 'tt-button--loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="tt-button__spinner" aria-hidden="true" /> : leftIcon}
      {children && <span className="tt-button__label">{children}</span>}
      {!loading && rightIcon}
    </button>
  );
}
