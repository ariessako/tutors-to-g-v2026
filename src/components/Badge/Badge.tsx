import type { HTMLAttributes } from 'react';
import { cx } from '../../cx';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  /** `soft` is a tinted fill with colored text; `solid` is a filled color with white text. */
  variant?: 'soft' | 'solid';
  size?: 'sm' | 'md';
  /** Shows a small colored dot before the label. */
  dot?: boolean;
}

export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx('tt-badge', `tt-badge--${tone}`, `tt-badge--${variant}`, `tt-badge--${size}`, className)}
      {...rest}
    >
      {dot && <span className="tt-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
