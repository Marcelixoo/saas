'use client';

import { FormEvent, useDeferredValue, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ApiError, type SearchParams } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FacetChip } from '@/components/ui/facet-chip';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useSearch } from '@/lib/hooks/useSearch';

const PAGE_SIZE = 20;
const FACET_FIELDS = ['category'];

type SortDirection = 'asc' | 'desc';

/**
 * Search tab: query, category facets (from `facetDistribution`), a price
 * sort control, and offset-based pagination, on top of the shared
 * `useSearch` SWR-mutation hook.
 */
export default function SearchTab() {
  const { selectedOrg } = useActiveOrg();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const slug = selectedOrg?.slug;

  const { results, run, isSearching, error } = useSearch(slug);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [offset, setOffset] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  function buildParams(overrides: Partial<SearchParams> = {}): SearchParams {
    return {
      q: query,
      filter: category ? `category = "${category}"` : undefined,
      sort: [`price:${sortDir}`],
      limit: PAGE_SIZE,
      offset,
      facets: FACET_FIELDS,
      ...overrides,
    };
  }

  async function runSearch(overrides: Partial<SearchParams> = {}) {
    if (!slug || !query) return;
    try {
      await run(buildParams(overrides));
      setHasSearched(true);
      mutate(`/organizations/${slug}/usage`);
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Search failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setOffset(0);
    runSearch({ offset: 0 });
  }

  function handleFacetClick(value: string) {
    const nextCategory = category === value ? null : value;
    setCategory(nextCategory);
    setOffset(0);
    runSearch({
      filter: nextCategory ? `category = "${nextCategory}"` : undefined,
      offset: 0,
    });
  }

  function handleSortChange(nextSort: SortDirection) {
    setSortDir(nextSort);
    runSearch({ sort: [`price:${nextSort}`] });
  }

  function handlePageChange(nextOffset: number) {
    setOffset(nextOffset);
    runSearch({ offset: nextOffset });
  }

  if (!selectedOrg) {
    return (
      <EmptyState
        title="No organization selected"
        description="Select an organization to search its catalog."
      />
    );
  }

  const hits = results?.hits ?? [];
  const total = results?.total ?? 0;
  const categoryFacets = results?.facetDistribution?.category ?? {};
  const categoryEntries = Object.entries(categoryFacets).toSorted((a, b) => b[1] - a[1]);
  const currentPage = Math.floor(offset / PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <form className="flex items-center gap-2" onSubmit={handleSubmit}>
        <SearchInput
          data-testid="search-input"
          placeholder="Search products…"
          aria-label="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          data-testid="search-sort"
          aria-label="Sort by price"
          value={sortDir}
          onChange={(e) => handleSortChange(e.target.value as SortDirection)}
          className="w-auto"
        >
          <option value="asc">Price: low to high</option>
          <option value="desc">Price: high to low</option>
        </Select>
        <Button variant="primary" type="submit" data-testid="search-submit" disabled={isSearching}>
          {isSearching ? <Spinner size="sm" label="Searching" /> : 'Search'}
        </Button>
      </form>

      {categoryEntries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {categoryEntries.map(([value, count]) => (
            <FacetChip
              key={value}
              data-testid={`search-facet-${value}`}
              active={category === value}
              onClick={() => handleFacetClick(value)}
            >
              {value} ({count})
            </FacetChip>
          ))}
        </div>
      ) : null}

      <Card>
        <div data-testid="search-results" className="divide-y divide-line-soft">
          {!hasSearched ? (
            <EmptyState
              title="No search yet"
              description="Enter a query to preview results from this catalog."
            />
          ) : hits.length === 0 ? (
            <EmptyState title="No results" description="No products matched your query." />
          ) : (
            hits.map((hit) => {
              const imageUrl = typeof hit.imageUrl === 'string' ? hit.imageUrl : null;
              const price = typeof hit.price === 'number' ? hit.price : null;
              return (
                <div key={hit.id} data-testid="search-hit" className="flex items-center gap-3 p-3">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={String(hit.title)}
                      loading="lazy"
                      className="size-12 shrink-0 rounded-sm bg-surface object-contain"
                    />
                  ) : null}
                  <span className="flex-1 text-sm text-ink">{String(hit.title)}</span>
                  {price !== null ? (
                    <span
                      data-testid="search-hit-price"
                      className="whitespace-nowrap font-semibold tabular-nums text-ink"
                    >
                      ${price.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {hasSearched && hits.length > 0 ? (
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>
            Page {currentPage + 1} of {totalPages} &middot; {total} result{total === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={currentPage <= 0}
              onClick={() => handlePageChange(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={currentPage + 1 >= totalPages}
              onClick={() => handlePageChange(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-crit">
          {deferredQuery ? `Search for "${deferredQuery}" failed.` : 'Search failed.'}
        </p>
      ) : null}
    </div>
  );
}
