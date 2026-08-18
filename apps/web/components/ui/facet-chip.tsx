import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FacetChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const FacetChip = React.forwardRef<HTMLButtonElement, FacetChipProps>(
  ({ className, active = false, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={active}
        className={cn(
          'rounded-full border px-2.5 py-1 text-xs',
          active
            ? 'border-primary bg-primary-tint font-semibold text-primary-press'
            : 'border-line-soft bg-ground font-medium text-ink-muted hover:bg-surface',
          className,
        )}
        {...props}
      />
    );
  },
);
FacetChip.displayName = 'FacetChip';

export { FacetChip };
