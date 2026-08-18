'use client';

import AppHeader from './AppHeader';
import MetricsTab from './tabs/MetricsTab';
import SearchTab from './tabs/SearchTab';
import CatalogTab from './tabs/CatalogTab';
import SettingsTab from './tabs/SettingsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-surface-2">
      <AppHeader onLogout={onLogout} />
      <main className="mx-auto max-w-6xl px-5 py-5">
        <Tabs defaultValue="metrics">
          <TabsList>
            <TabsTrigger value="metrics" data-testid="tab-metrics">
              Metrics
            </TabsTrigger>
            <TabsTrigger value="search" data-testid="tab-search">
              Search
            </TabsTrigger>
            <TabsTrigger value="catalog" data-testid="tab-catalog">
              Catalog
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              Settings
            </TabsTrigger>
          </TabsList>
          <TabsContent value="metrics" className="pt-4">
            <MetricsTab />
          </TabsContent>
          <TabsContent value="search" className="pt-4">
            <SearchTab />
          </TabsContent>
          <TabsContent value="catalog" className="pt-4">
            <CatalogTab />
          </TabsContent>
          <TabsContent value="settings" className="pt-4">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
