'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { SECTION_LABELS, type SectionId } from './sections/sections';

/**
 * Console topbar: breadcrumb (org / section), operational status, the plan
 * indicator (opens Settings), and the always-available "Seed catalog" action.
 */
export default function Topbar({
  section,
  onOpenPlan,
  onSeed,
  seeding,
}: {
  section: SectionId;
  onOpenPlan: () => void;
  onSeed: () => void;
  seeding: boolean;
}) {
  const { selectedOrg } = useActiveOrg();
  const { mutate } = useSWRConfig();
  const [refreshing, setRefreshing] = useState(false);
  const orgName = selectedOrg?.name ?? '—';
  const plan = selectedOrg?.plan ?? 'FREE';

  // Revalidate every cached SWR key so freshly-indexed documents, usage counts,
  // and members re-fetch without a full app reload.
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await mutate(() => true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ground px-5 py-2.5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-mono text-[12px] text-ink-muted">
        <span className="text-ink-faint">{orgName}</span>
        <span className="text-ink-faint">/</span>
        <span className="font-semibold text-ink">{SECTION_LABELS[section]}</span>
      </nav>

      <div className="flex items-center gap-2.5">
        <Badge variant="good">
          <span aria-hidden="true">●</span> Operational
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          data-testid="refresh-data"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh data"
          title="Refresh data"
        >
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} aria-hidden="true" />
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenPlan}
          className="gap-1.5"
          aria-label="Manage plan"
        >
          Plan
          <span
            data-testid="plan-badge"
            className="rounded-full border border-line bg-surface px-1.5 py-px font-mono text-[10px] font-semibold text-ink"
          >
            {plan}
          </span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          data-testid="seed-catalog"
          onClick={onSeed}
          disabled={seeding || !selectedOrg}
        >
          {seeding ? <Spinner size="sm" /> : null}
          Seed catalog
        </Button>
      </div>
    </header>
  );
}
