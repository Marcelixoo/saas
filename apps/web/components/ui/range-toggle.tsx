'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface RangeToggleOption {
  value: string;
  label: React.ReactNode;
}

export interface RangeToggleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: RangeToggleOption[];
  value: string;
  onValueChange: (value: string) => void;
  'aria-label': string;
}

/** Segmented control used for time-range pickers (1H / 24H / 7D, etc). */
const RangeToggle = React.forwardRef<HTMLDivElement, RangeToggleProps>(
  ({ options, value, onValueChange, className, ...props }, ref) => {
    const buttonsRef = React.useRef<Array<HTMLButtonElement | null>>([]);

    const focusOption = (index: number) => {
      const nextIndex = Math.max(0, Math.min(index, options.length - 1));
      buttonsRef.current[nextIndex]?.focus();
      onValueChange(options[nextIndex]!.value);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = options.findIndex((option) => option.value === value);
      if (currentIndex === -1) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          focusOption(currentIndex + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          focusOption(currentIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          focusOption(0);
          break;
        case 'End':
          event.preventDefault();
          focusOption(options.length - 1);
          break;
      }
    };

    return (
      <div
        ref={ref}
        role="radiogroup"
        onKeyDown={handleKeyDown}
        className={cn('inline-flex overflow-hidden rounded-sm border border-line', className)}
        {...props}
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                buttonsRef.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onValueChange(option.value)}
              className={cn(
                'border-0 px-[11px] py-1.5 text-xs font-semibold',
                index > 0 && 'border-l border-line-soft',
                active ? 'bg-primary-tint text-primary-press' : 'bg-ground text-ink-muted hover:bg-surface',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  },
);
RangeToggle.displayName = 'RangeToggle';

export { RangeToggle };
