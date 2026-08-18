'use client';

import { KpiCard } from '@/components/ui/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useUsage } from '@/lib/hooks/useUsage';

/**
 * Foundation Metrics tab: aggregate usage counts. Agent A extends this with a
 * volume-over-time chart backed by `useUsageTimeseries`.
 */
export default function MetricsTab() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? null;
  const { usage } = useUsage(slug);

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

  return (
    <div className="grid gap-3.5 sm:grid-cols-3">
      <KpiCard
        label="Searches"
        value={<span data-testid="usage-search-count">{searchCount}</span>}
      />
      <KpiCard
        label="Rate-limited"
        value={<span data-testid="usage-rate-limit-count">{rateLimited}</span>}
      />
      <KpiCard label="Documents indexed" value={indexCount} />
    </div>
  );
}
