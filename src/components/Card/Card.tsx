import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Heading shown at the top of the card. */
  title?: ReactNode;
  /** Smaller text under the title. */
  subtitle?: ReactNode;
  /** Image or illustration shown edge to edge above the content. */
  media?: ReactNode;
  /** Content pinned to the bottom, typically actions. */
  footer?: ReactNode;
  /** `elevated` has a shadow, `outlined` a border, `tinted` a soft coral fill. */
  variant?: 'elevated' | 'outlined' | 'tinted';
  padding?: 'sm' | 'md' | 'lg';
  /** Adds a hover lift, for cards that are clickable as a whole. */
  interactive?: boolean;
}

export function Card({
  title,
  subtitle,
  media,
  footer,
  variant = 'elevated',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx(
        'tt-card',
        `tt-card--${variant}`,
        `tt-card--pad-${padding}`,
        interactive && 'tt-card--interactive',
        className,
      )}
      {...rest}
    >
      {media && <div className="tt-card__media">{media}</div>}
      <div className="tt-card__body">
        {(title || subtitle) && (
          <div className="tt-card__header">
            {title && <h3 className="tt-card__title">{title}</h3>}
            {subtitle && <p className="tt-card__subtitle">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
      {footer && <div className="tt-card__footer">{footer}</div>}
    </div>
  );
}
