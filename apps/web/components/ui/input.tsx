import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Set `aria-invalid="true"` to switch to the error border color — this
 * keeps the visual state and the accessible state in sync.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'w-full rounded-sm border border-line bg-ground px-[11px] py-[9px] text-sm text-ink placeholder:text-ink-faint',
          'focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-1',
          'aria-invalid:border-crit aria-invalid:focus-visible:outline-crit',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
