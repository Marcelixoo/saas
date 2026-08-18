'use client';

import { useState } from 'react';
import { KpiCard } from '@/components/ui/kpi-card';
import { ChartCard } from '@/components/ui/chart-card';
import { LegendItem } from '@/components/ui/legend-item';
import { LineChart } from '@/components/ui/line-chart';
import { RangeToggle } from '@/components/ui/range-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import type { UsageWindow } from '@/lib/api';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useCatalog } from '@/lib/hooks/useCatalog';
import { useUsage } from '@/lib/hooks/useUsage';
import { useUsageTimeseries } from '@/lib/hooks/useUsageTimeseries';
import { PageHeader } from './sections';

const CHART_HEIGHT_PX = 128;

const RANGE_OPTIONS: { value: UsageWindow; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '3h', label: '3H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
];

const RANGE_NOW_LABEL: Record<UsageWindow, string> = {
  '1h': 'last 1 hour',
  '3h': 'last 3 hours',
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
};

/** `HH:MM` for sub-day windows, `Mon DD` for the 7-day window (UTC). */
function formatBucketLabel(ts: string, usageWindow: UsageWindow): string {
  const date = new Date(ts);
  if (usageWindow === '7d') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

/**
 * Metrics section: real usage KPIs (searches, documents indexed, rate-limited,
 * error rate) with per-series sparklines, plus a request-volume line chart
 * over a selectable window (1h/3h/24h/7d, bucketed server-side at a
 * resolution appropriate to the window). Layout follows the .pen console
 * (page header + range toggle + KPI row + chart).
 */
export default function MetricsSection() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? null;
  const [usageWindow, setUsageWindow] = useState<UsageWindow>('24h');

  const { usage } = useUsage(slug);
  const { points, isLoading: isChartLoading } = useUsageTimeseries(slug, usageWindow);
  // The "Documents indexed" KPI must reflect the CURRENT number of documents
  // in the tenant index (the same source of truth as the Catalog/Search
  // pages), not `usage.indexCount` — which only counts successful INDEX API
  // *operations* (e.g. seed batches), not documents. Those two numbers can
  // legitimately differ a lot: a single seed request indexing hundreds of
  // documents is still just one INDEX operation. Rendering `indexCount`
  // instead of this catalog total was the root cause of "Documents indexed"
  // (operation count) disagreeing with the Search tab's result count
  // (document count) for the same organization.
  const { total: documentCount } = useCatalog(slug, { offset: 0, limit: 1 });

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
  const attempted = searchCount + rateLimited;
  const errorRate = attempted > 0 ? (rateLimited / attempted) * 100 : 0;

  const searchSpark = points.map((p) => p.search);
  const indexSpark = points.map((p) => p.index);
  const rateLimitedSpark = points.map((p) => p.rateLimited);

  const maxTotal = points.reduce(
    (max, point) => Math.max(max, point.search + point.index + point.rateLimited),
    0,
  );
  const hasActivity = maxTotal > 0;
  const pointLabels = points.map((p) => formatBucketLabel(p.ts, usageWindow));

  const chartBody = isChartLoading ? (
    <Skeleton className="w-full" style={{ height: `${CHART_HEIGHT_PX}px` }} />
  ) : !hasActivity ? (
    <EmptyState
      title="No requests yet"
      description="Search and indexing activity will appear here once this organization starts making requests."
    />
  ) : (
    <div data-testid="metrics-chart">
      <LineChart
        height={CHART_HEIGHT_PX}
        pointLabels={pointLabels}
        series={[
          { values: searchSpark, color: 'var(--chart-p50)' },
          { values: indexSpark, color: 'var(--chart-series-2)' },
          { values: rateLimitedSpark, color: 'var(--crit)' },
        ]}
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-faint">
        <span>{pointLabels[0]}</span>
        <span>{pointLabels[pointLabels.length - 1]}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title="Metrics"
        description="Search and indexing activity for this organization."
        actions={
          <RangeToggle
            data-testid="metrics-range-toggle"
            options={RANGE_OPTIONS}
            value={usageWindow}
            onValueChange={(value) => setUsageWindow(value as UsageWindow)}
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
        <KpiCard
          label="Documents indexed"
          value={<span data-testid="usage-index-count">{documentCount}</span>}
          sparkline={indexSpark}
        />
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
        now={RANGE_NOW_LABEL[usageWindow]}
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
