import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Champ texte du design system v2, avec label optionnel. */
export function Input({ label, className = '', id, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="v2-field">
      {label && (
        <label className="v2-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={`v2-input${className ? ` ${className}` : ''}`} {...rest} />
    </div>
  );
}
