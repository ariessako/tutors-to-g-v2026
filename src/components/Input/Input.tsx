import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label above the field. */
  label?: string;
  /** Helper text below the field. Hidden while `error` is set. */
  hint?: string;
  /** Error message. Turns the field red and marks it invalid. */
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Icon shown inside the field, before the text. */
  leftIcon?: ReactNode;
}

export function Input({ label, hint, error, size = 'md', leftIcon, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className={cx('tt-field', className)}>
      {label && (
        <label className="tt-field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={cx('tt-input', `tt-input--${size}`, error && 'tt-input--error')}>
        {leftIcon && <span className="tt-input__icon">{leftIcon}</span>}
        <input
          id={inputId}
          className="tt-input__control"
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          {...rest}
        />
      </div>
      {message && (
        <p id={messageId} className={cx('tt-field__message', error && 'tt-field__message--error')}>
          {message}
        </p>
      )}
    </div>
  );
}
