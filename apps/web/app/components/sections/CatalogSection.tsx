'use client';

import { useState } from 'react';
import { type CatalogDocument } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useCatalog } from '@/lib/hooks/useCatalog';
import { PageHeader } from './sections';

const PAGE_SIZE = 20;

/**
 * Catalog data section: browse the tenant's indexed documents page by page.
 * Seeding is triggered from the topbar; `seedInfo` carries the last result so
 * the confirmation surfaces here next to the catalog it populated.
 */
export default function CatalogSection({ seedInfo }: { seedInfo: string | null }) {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? '';
  const [offset, setOffset] = useState(0);

  const { documents, total, isLoading, error } = useCatalog(slug, {
    offset,
    limit: PAGE_SIZE,
  });

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

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
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title="Catalog data"
        description="Inspect the documents indexed for this organization. Use “Seed catalog” to load a 500-product sample."
        actions={
          seedInfo ? (
            <span data-testid="catalog-seed-info" className="text-[13px] font-semibold text-good">
              {seedInfo}
            </span>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Indexed products</CardTitle>
          <CardDescription>
            {total > 0 ? `${total} products indexed for this organization.` : 'Browse indexed products.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <Table aria-busy="true" aria-label="Loading indexed products">
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: PAGE_SIZE > 6 ? 6 : PAGE_SIZE }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Skeleton className="size-10 rounded-sm" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-14" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-20" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : error ? (
            <EmptyState
              title="Failed to load catalog"
              description="Something went wrong while loading indexed products."
            />
          ) : documents.length === 0 ? (
            <EmptyState
              title="No products indexed yet"
              description="Use “Seed catalog” in the topbar to populate this list."
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
                    disabled={!hasPrev || isLoading}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="catalog-next-page"
                    onClick={handleNext}
                    disabled={!hasNext || isLoading}
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
