import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LineChartSeries {
  /** Values, one per point, in the same order/length as every other series. */
  values: number[];
  color: string;
}

export interface LineChartProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'color'> {
  series: LineChartSeries[];
  /** Optional per-point tooltip title text. */
  pointLabels?: string[];
  height?: number;
}

const VIEW_WIDTH = 600;

/**
 * Minimal inline-SVG multi-series line chart. No external charting lib —
 * plots each series as a polyline scaled to a shared 0..max y-axis, with a
 * light horizontal baseline. Consistent with the console's plain, data-dense
 * look (see ChartCard/KpiCard).
 */
const LineChart = React.forwardRef<SVGSVGElement, LineChartProps>(
  ({ series, pointLabels, height = 128, className, ...props }, ref) => {
    const pointCount = series[0]?.values.length ?? 0;
    const max = Math.max(1, ...series.flatMap((s) => s.values));

    function toPath(values: number[]): string {
      if (pointCount <= 1) return '';
      return values
        .map((v, i) => {
          const x = (i / (pointCount - 1)) * VIEW_WIDTH;
          const y = height - (v / max) * height;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
    }

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        className={cn('w-full', className)}
        style={{ height: `${height}px` }}
        role="img"
        aria-label="Request volume over time"
        {...props}
      >
        <line
          x1={0}
          y1={height - 0.5}
          x2={VIEW_WIDTH}
          y2={height - 0.5}
          stroke="var(--line-soft)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {series.map((s, si) => (
          <path
            key={si}
            d={toPath(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s, si) =>
          s.values.map((v, i) => {
            const x = pointCount > 1 ? (i / (pointCount - 1)) * VIEW_WIDTH : VIEW_WIDTH / 2;
            const y = height - (v / max) * height;
            return (
              <circle key={`${si}-${i}`} cx={x} cy={y} r={2} fill={s.color}>
                {pointLabels?.[i] ? <title>{`${pointLabels[i]}: ${v}`}</title> : null}
              </circle>
            );
          }),
        )}
      </svg>
    );
  },
);
LineChart.displayName = 'LineChart';

export { LineChart };
