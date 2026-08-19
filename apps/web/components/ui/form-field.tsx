import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface FormFieldProps extends InputProps {
  label: string;
  /** Error message shown below the input; also flips the input to its invalid style. */
  error?: string;
  /** Helper text shown below the input when there is no error, e.g. format guidance. */
  hint?: string;
  containerClassName?: string;
}

/**
 * Convenience wrapper around Label + Input for the common case. For
 * anything more advanced (radio groups, custom controls), compose
 * `Label` and `Input` directly instead.
 */
const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, hint, id, containerClassName, className, ...inputProps }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint && !error ? `${inputId}-hint` : undefined;

    return (
      <div className={cn('flex flex-col gap-1.5', containerClassName)}>
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          id={inputId}
          ref={ref}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId ?? hintId}
          className={className}
          {...inputProps}
        />
        {error ? (
          <p id={errorId} className="text-xs font-medium text-crit">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-ink-faint">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
FormField.displayName = 'FormField';

export { FormField };
