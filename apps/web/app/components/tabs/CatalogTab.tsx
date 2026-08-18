'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useSeedCatalog } from '@/lib/hooks/mutations';

/**
 * Foundation Catalog tab: seed the sample catalog. Agent C extends this with a
 * paginated document explorer backed by `useCatalog` / `listDocuments`.
 */
export default function CatalogTab() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? '';
  const { trigger: seed, isMutating } = useSeedCatalog(slug);
  const { toast } = useToast();
  const [info, setInfo] = useState<string | null>(null);

  async function handleSeed() {
    if (!slug) return;
    setInfo(null);
    try {
      const result = await seed();
      const msg = `Seeded ${result?.accepted ?? 0} products.`;
      setInfo(msg);
      toast({ variant: 'success', title: 'Catalog seeded', description: msg });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Seeding failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  if (!selectedOrg) {
    return (
      <EmptyState
        title="No organization selected"
        description="Select an organization to manage its catalog."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sample catalog</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CardDescription>
          Seed a 500-product sample of the real product catalog (with images and prices) for
          this organization.
        </CardDescription>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            data-testid="seed-catalog"
            onClick={handleSeed}
            disabled={isMutating}
          >
            {isMutating ? <Spinner size="sm" /> : null}
            Seed sample catalog
          </Button>
          {info ? (
            <span data-testid="catalog-seed-info" className="text-[13px] font-medium text-good">
              {info}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
