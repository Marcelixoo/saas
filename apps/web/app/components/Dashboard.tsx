'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useSeedCatalog } from '@/lib/hooks/mutations';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MetricsSection from './sections/MetricsSection';
import SearchSection from './sections/SearchSection';
import CatalogSection from './sections/CatalogSection';
import MembersSection from './sections/MembersSection';
import UpgradeRequestsSection from './sections/UpgradeRequestsSection';
import SettingsSection from './sections/SettingsSection';
import type { SectionId } from './sections/sections';

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [section, setSection] = useState<SectionId>('metrics');
  const [seedInfo, setSeedInfo] = useState<string | null>(null);

  const { selectedOrg } = useActiveOrg();
  const { toast } = useToast();
  const { trigger: seed, isMutating: seeding } = useSeedCatalog(selectedOrg?.slug ?? '');

  async function handleSeed() {
    if (!selectedOrg) return;
    setSeedInfo(null);
    try {
      const result = await seed();
      const msg = `Seeded ${result?.accepted ?? 0} products.`;
      setSeedInfo(msg);
      toast({ variant: 'success', title: 'Catalog seeded', description: msg });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Seeding failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  return (
    <div className="flex min-h-screen bg-surface-2">
      <Sidebar section={section} onSelect={setSection} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          section={section}
          onOpenPlan={() => setSection('settings')}
          onSeed={handleSeed}
          seeding={seeding}
        />
        <main className="flex-1 overflow-y-auto p-5">
          {section === 'metrics' ? <MetricsSection /> : null}
          {section === 'search' ? <SearchSection /> : null}
          {section === 'catalog' ? <CatalogSection seedInfo={seedInfo} /> : null}
          {section === 'members' ? <MembersSection /> : null}
          {section === 'upgrade' ? <UpgradeRequestsSection /> : null}
          {section === 'settings' ? <SettingsSection /> : null}
        </main>
      </div>
    </div>
  );
}
