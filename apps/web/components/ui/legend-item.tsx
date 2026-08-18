import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LegendItemProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Swatch color — a token like `var(--chart-p50)` or any valid CSS color. */
  color: string;
}

const LegendItem = React.forwardRef<HTMLSpanElement, LegendItemProps>(
  ({ color, className, children, style, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn('inline-flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted', className)}
        style={style}
        {...props}
      >
        <span className="inline-block h-[3px] w-2.5 rounded-sm" style={{ background: color }} />
        {children}
      </span>
    );
  },
);
LegendItem.displayName = 'LegendItem';

export { LegendItem };
