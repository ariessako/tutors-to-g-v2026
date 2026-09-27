import { useState, type HTMLAttributes } from 'react';
import { cx } from '../../cx';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Person's name. Used for the alt text and for the initials fallback. */
  name: string;
  /** Photo URL. Initials are shown when missing or when the image fails to load. */
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Presence dot in the bottom-right corner. */
  status?: 'online' | 'away' | 'offline';
}

const FALLBACK_COLORS = ['coral', 'violet', 'green', 'blue', 'amber'] as const;

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function Avatar({ name, src, size = 'md', status, className, ...rest }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <span
      className={cx('tt-avatar', `tt-avatar--${size}`, !showImage && `tt-avatar--${colorFor(name)}`, className)}
      role="img"
      aria-label={status ? `${name} (${status})` : name}
      {...rest}
    >
      {showImage ? (
        <img className="tt-avatar__image" src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="tt-avatar__initials" aria-hidden="true">{initials(name)}</span>
      )}
      {status && <span className={cx('tt-avatar__status', `tt-avatar__status--${status}`)} aria-hidden="true" />}
    </span>
  );
}
