/** Small presentational building blocks matching the design. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { avatar } from '../../../shared/format';

export const Icon = ({ name, style, className = '' }: { name: string; style?: CSSProperties; className?: string }) => (
  <i className={`ph-duotone ph-${name} ${className}`} style={style} aria-hidden="true" />
);

export function Avatar({ name, size = 36, square = false, style }: { name: string; size?: number; square?: boolean; style?: CSSProperties }) {
  const a = avatar(name);
  return (
    <span
      className={`avatar${square ? ' square' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.33)),
        background: `color-mix(in srgb, ${a.color} 16%, var(--color-surface))`,
        color: a.color,
        ...style,
      }}
      aria-hidden="true"
    >
      {a.ini}
    </span>
  );
}

export type Tone = 'info' | 'ok' | 'warn' | 'bad' | 'neutral' | 'accent';

export const Tag = ({ tone = 'neutral', icon, size, children }: { tone?: Tone; icon?: string; size?: 'sm' | 'lg'; children: ReactNode }) => (
  <span className={`tag tag-${tone}${size ? ` tag-${size}` : ''}`}>
    {icon && <Icon name={icon} />}
    {children}
  </span>
);

/** Circular match-percentage ring. */
export function MatchRing({ pct, size = 50 }: { pct: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" style={{ flex: 'none' }} role="img" aria-label={`${pct}% match`}>
      <circle cx="22" cy="22" r="18" style={{ fill: 'none', stroke: 'var(--color-surface-2)', strokeWidth: 5 }} />
      <circle
        cx="22"
        cy="22"
        r="18"
        transform="rotate(-90 22 22)"
        style={{ fill: 'none', stroke: 'var(--color-accent)', strokeWidth: 5, strokeLinecap: 'round', strokeDasharray: `${((pct / 100) * 113.1).toFixed(1)} 113.1` }}
      />
      <text x="22" y="26" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--color-text)', textAnchor: 'middle', fontFamily: 'var(--font-body)' }}>
        {pct}%
      </text>
    </svg>
  );
}

export const Bar = ({ pct, color, variant }: { pct: number; color?: string; variant?: 'thin' | 'thick' }) => (
  <div className={`bar${variant ? ` ${variant}` : ''}`}>
    <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
  </div>
);

export function DateTile({ date, size = 'md' }: { date: string; size?: 'sm' | 'md' | 'lg' }) {
  const d = new Date(date + 'T00:00');
  const dims = { sm: [44, 46, 9, 18], md: [58, 60, 10, 24], lg: [74, 78, 12, 34] }[size];
  return (
    <div className="date-tile" style={{ width: dims[0], height: dims[1], borderRadius: size === 'lg' ? 12 : size === 'sm' ? 9 : 10 }}>
      <span className="mon" style={{ fontSize: dims[2] }}>{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
      <span className="day" style={{ fontSize: dims[3] }}>{d.getDate()}</span>
    </div>
  );
}

export function Stat({ icon, n, label, onClick }: { icon: string; n: ReactNode; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="icon-tile">
        <Icon name={icon} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="stat-n">{n}</span>
        <span className="stat-label">{label}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className="stat" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="stat">{inner}</div>
  );
}

export function CardHead({ icon, title, sub, children }: { icon?: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="row">
        {icon && <Icon name={icon} />}
        <div>
          <h3>{title}</h3>
          {sub && <p className="muted" style={{ fontSize: 12 }}>{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

/** A segmented control (the design's radio-button pill group). */
export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  label,
  large,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  large?: boolean;
}) {
  return (
    <div className={`seg${large ? ' seg-lg' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`seg-opt${o.value === value ? ' on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const ErrorBox = ({ error }: { error: string | null | undefined }) =>
  error ? (
    <div className="alert alert-bad" role="alert">
      <Icon name="warning-circle" />
      {error}
    </div>
  ) : null;

export const Loading = () => (
  <div className="empty-inline" aria-live="polite">
    <Icon name="spinner-gap" />
    Loading…
  </div>
);

export function Field({ label, children, style }: { label: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <label className="field" style={style}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** Modal dialog. Closes on Escape and on a backdrop click. */
export function Modal({ onClose, children, width = 520, top = false, label }: { onClose: () => void; children: ReactNode; width?: number; top?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className={`backdrop${top ? ' top' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={label} style={{ width: `min(${width}px, 100%)` }}>
        {children}
      </div>
    </div>
  );
}

// Toasts
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const FLASH_KEY = 'ttg-flash';

/** Queues a toast to show after the next full page load (e.g. right after logging in). */
export function flash(msg: string) {
  try {
    sessionStorage.setItem(FLASH_KEY, msg);
  } catch {
    /* storage unavailable: skip the message */
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    clearTimeout(timer.current);
    setMsg(m);
    timer.current = setTimeout(() => setMsg(null), 3800);
  }, []);
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(FLASH_KEY);
      if (m) {
        sessionStorage.removeItem(FLASH_KEY);
        show(m);
      }
    } catch {
      /* storage unavailable */
    }
  }, [show]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite">
        {msg && (
          <div className="toast" role="status">
            <Icon name="check-circle" />
            {msg}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

// Theme
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const toggle = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem('ttg-theme', t);
    } catch {
      /* private mode */
    }
    setTheme(t);
  };
  return {
    theme,
    toggle,
    icon: theme === 'dark' ? 'sun' : 'moon',
    label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  };
}
