'use client';

import { useState } from 'react';
import { ApiError, type CatalogDocument } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useSeedCatalog } from '@/lib/hooks/mutations';
import { useCatalog } from '@/lib/hooks/useCatalog';

const PAGE_SIZE = 20;

/**
 * Catalog tab: seed the sample catalog, then browse it page by page. Backed
 * by `useCatalog` (SWR) for the paginated document explorer.
 */
export default function CatalogTab() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? '';
  const { trigger: seed, isMutating } = useSeedCatalog(slug);
  const { toast } = useToast();
  const [info, setInfo] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const { documents, total, isLoading, error } = useCatalog(slug, {
    offset,
    limit: PAGE_SIZE,
  });

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  async function handleSeed() {
    if (!slug) return;
    setInfo(null);
    try {
      const result = await seed();
      const msg = `Seeded ${result?.accepted ?? 0} products.`;
      setInfo(msg);
      setOffset(0);
      toast({ variant: 'success', title: 'Catalog seeded', description: msg });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Seeding failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  function handlePrev() {
    setOffset((current) => Math.max(0, current - PAGE_SIZE));
  }

  function handleNext() {
    setOffset((current) => current + PAGE_SIZE);
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
    <div className="flex flex-col gap-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Indexed products</CardTitle>
          <CardDescription>
            {total > 0 ? `${total} products indexed for this organization.` : 'Browse indexed products.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <EmptyState
              title="Failed to load catalog"
              description="Something went wrong while loading indexed products."
            />
          ) : documents.length === 0 ? (
            <EmptyState
              title="No products indexed yet"
              description="Seed the sample catalog above to populate this list."
            />
          ) : (
            <>
              <Table data-testid="catalog-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc: CatalogDocument) => {
                    const imageUrl = typeof doc.imageUrl === 'string' ? doc.imageUrl : null;
                    const price = typeof doc.price === 'number' ? doc.price : null;
                    const category = typeof doc.category === 'string' ? doc.category : null;
                    return (
                      <TableRow key={doc.id} data-testid="catalog-row">
                        <TableCell>
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt={doc.title}
                              loading="lazy"
                              className="size-10 shrink-0 rounded-sm bg-surface object-contain"
                            />
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">{doc.title}</TableCell>
                        <TableCell className="tabular-nums">
                          {price !== null ? `$${price.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell>{category ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[13px] text-ink-muted">
                  Page {page} of {pageCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="catalog-prev-page"
                    onClick={handlePrev}
                    disabled={!hasPrev}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="catalog-next-page"
                    onClick={handleNext}
                    disabled={!hasNext}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
