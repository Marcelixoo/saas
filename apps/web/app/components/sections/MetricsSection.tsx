'use client';

import { useState } from 'react';
import { KpiCard } from '@/components/ui/kpi-card';
import { ChartCard } from '@/components/ui/chart-card';
import { LegendItem } from '@/components/ui/legend-item';
import { RangeToggle } from '@/components/ui/range-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useUsage } from '@/lib/hooks/useUsage';
import { useUsageTimeseries } from '@/lib/hooks/useUsageTimeseries';
import { PageHeader } from './sections';

const CHART_HEIGHT_PX = 128;

const RANGE_OPTIONS = [
  { value: '7', label: '7D' },
  { value: '14', label: '14D' },
  { value: '30', label: '30D' },
];

/**
 * Metrics section: real usage KPIs (searches, documents indexed, rate-limited,
 * error rate) with per-series sparklines, plus a per-day request-volume chart.
 * Layout follows the .pen console (page header + range toggle + KPI row + chart).
 */
export default function MetricsSection() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? null;
  const [days, setDays] = useState('14');

  const { usage } = useUsage(slug);
  const { points, isLoading: isChartLoading } = useUsageTimeseries(slug, Number(days));

  if (!selectedOrg) {
    return (
      <EmptyState
        title="No organization selected"
        description="Create or select an organization to see its metrics."
      />
    );
  }

  const searchCount = usage?.searchCount ?? 0;
  const rateLimited = usage?.rateLimitedCount ?? 0;
  const indexCount = usage?.indexCount ?? 0;
  const attempted = searchCount + rateLimited;
  const errorRate = attempted > 0 ? (rateLimited / attempted) * 100 : 0;

  const searchSpark = points.map((p) => p.search);
  const indexSpark = points.map((p) => p.index);
  const rateLimitedSpark = points.map((p) => p.rateLimited);

  const maxDailyTotal = points.reduce(
    (max, point) => Math.max(max, point.search + point.index + point.rateLimited),
    0,
  );
  const hasActivity = maxDailyTotal > 0;

  const chartBody = isChartLoading ? (
    <Skeleton className="w-full" style={{ height: `${CHART_HEIGHT_PX}px` }} />
  ) : !hasActivity ? (
    <EmptyState
      title="No requests yet"
      description="Search and indexing activity will appear here once this organization starts making requests."
    />
  ) : (
    <div
      className="flex w-full items-end gap-1"
      style={{ height: `${CHART_HEIGHT_PX}px` }}
      data-testid="metrics-chart"
    >
      {points.map((point) => {
        const searchHeight = (point.search / maxDailyTotal) * 100;
        const indexHeight = (point.index / maxDailyTotal) * 100;
        const rateLimitedHeight = (point.rateLimited / maxDailyTotal) * 100;
        return (
          <div key={point.date} className="flex h-full w-full flex-col justify-end gap-px" title={point.date}>
            <span className="w-full rounded-t-sm bg-crit opacity-80" style={{ height: `${rateLimitedHeight}%` }} />
            <span className="w-full bg-chart-series-2 opacity-80" style={{ height: `${indexHeight}%` }} />
            <span className="w-full bg-chart-p50 opacity-80" style={{ height: `${searchHeight}%` }} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title="Metrics"
        description="Search and indexing activity for this organization."
        actions={
          <RangeToggle
            options={RANGE_OPTIONS}
            value={days}
            onValueChange={setDays}
            aria-label="Metrics time range"
          />
        }
      />

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Searches"
          value={<span data-testid="usage-search-count">{searchCount}</span>}
          sparkline={searchSpark}
        />
        <KpiCard label="Documents indexed" value={indexCount} sparkline={indexSpark} />
        <KpiCard
          label="Rate-limited"
          value={<span data-testid="usage-rate-limit-count">{rateLimited}</span>}
          sparkline={rateLimitedSpark}
        />
        <KpiCard
          label="Error rate"
          value={errorRate.toFixed(1)}
          unit="%"
          delta={{
            direction: errorRate > 0 ? 'down' : 'flat',
            text: `${rateLimited} of ${attempted}`,
          }}
        />
      </div>

      <ChartCard
        title="Request volume"
        now={`last ${days} days`}
        full
        legend={
          <>
            <LegendItem color="var(--chart-p50)">search</LegendItem>
            <LegendItem color="var(--chart-series-2)">index</LegendItem>
            <LegendItem color="var(--crit)">rate-limited</LegendItem>
          </>
        }
      >
        {chartBody}
      </ChartCard>
    </div>
  );
}
