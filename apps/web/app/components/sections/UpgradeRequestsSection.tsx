'use client';

import { TrendingUp } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from './sections';

/**
 * Upgrade requests section: placeholder for the plan upgrade-request workflow,
 * deferred to a later phase.
 */
export default function UpgradeRequestsSection() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title="Upgrade requests"
        description="Review and approve member requests to move this organization onto a higher plan."
      />
      <EmptyState
        icon={TrendingUp}
        title="Coming soon"
        description="The upgrade-request workflow lands in a later phase. For now, change plans directly from Settings."
      />
    </div>
  );
}
