import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../cx';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Selected tab id, for controlled use. */
  value?: string;
  /** Initially selected tab id, for uncontrolled use. Defaults to the first enabled tab. */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** `line` underlines the active tab; `pill` fills it. */
  variant?: 'line' | 'pill';
  /** Accessible name for the tab list. */
  'aria-label'?: string;
  className?: string;
}

export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  variant = 'line',
  'aria-label': ariaLabel,
  className,
}: TabsProps) {
  const baseId = useId();
  const firstEnabled = items.find((t) => !t.disabled)?.id;
  const [internal, setInternal] = useState(defaultValue ?? firstEnabled);
  const selected = value ?? internal;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const enabled = items.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    const pos = enabled.indexOf(index);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    select(items[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={cx('tt-tabs', `tt-tabs--${variant}`, className)}>
      <div className="tt-tabs__list" role="tablist" aria-label={ariaLabel}>
        {items.map((tab, i) => {
          const active = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              className={cx('tt-tabs__tab', active && 'tt-tabs__tab--active')}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {items.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          className="tt-tabs__panel"
          hidden={tab.id !== selected}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
