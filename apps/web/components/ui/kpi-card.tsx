import * as React from 'react';
import { cn } from '@/lib/utils';

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: {
    direction: 'up' | 'down' | 'flat';
    text: string;
  };
  /** Relative bar heights for the mini sparkline (any positive numbers). */
  sparkline?: number[];
}

type DeltaDirection = NonNullable<KpiCardProps['delta']>['direction'];

const DELTA_COLOR: Record<DeltaDirection, string> = {
  up: 'text-good',
  down: 'text-crit',
  flat: 'text-ink-faint',
};

const DELTA_GLYPH: Record<DeltaDirection, string> = {
  up: '▲',
  down: '▼',
  flat: '▬',
};

const KpiCard = React.forwardRef<HTMLDivElement, KpiCardProps>(
  ({ label, value, unit, delta, sparkline, className, ...props }, ref) => {
    const maxBar = sparkline && sparkline.length > 0 ? Math.max(...sparkline) : 1;

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-[7px] rounded-lg border border-line bg-ground p-3.5',
          className,
        )}
        {...props}
      >
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
          {label}
        </span>
        <div className="flex items-end gap-1.5">
          <span className="text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</span>
          {unit ? <span className="text-xs font-semibold text-ink-faint">{unit}</span> : null}
        </div>
        {delta ? (
          <span className={cn('font-mono text-[11px] font-semibold', DELTA_COLOR[delta.direction])}>
            {DELTA_GLYPH[delta.direction]} {delta.text}
          </span>
        ) : null}
        {sparkline && sparkline.length > 0 ? (
          <div className="mt-0.5 flex h-[26px] w-full items-end gap-0.5" aria-hidden="true">
            {sparkline.map((height, index) => (
              <span
                key={index}
                className="w-full rounded-[1px] bg-primary opacity-55"
                style={{ height: `${Math.max(8, (height / maxBar) * 100)}%` }}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);
KpiCard.displayName = 'KpiCard';

export { KpiCard };
