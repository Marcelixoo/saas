import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ChartCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  /** Small mono value shown top-right of the header, e.g. "now: 42ms". */
  now?: React.ReactNode;
  legend?: React.ReactNode;
  /** Span both columns in a two-up chart grid. */
  full?: boolean;
}

const ChartCard = React.forwardRef<HTMLDivElement, ChartCardProps>(
  ({ title, now, legend, full = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-2.5 rounded-lg border border-line bg-ground p-[14px_15px]',
          full && 'col-span-full',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
          {now ? <span className="font-mono text-xs text-ink-muted">{now}</span> : null}
        </div>
        {legend ? <div className="flex flex-wrap gap-3.5">{legend}</div> : null}
        {children}
      </div>
    );
  },
);
ChartCard.displayName = 'ChartCard';

export { ChartCard };
