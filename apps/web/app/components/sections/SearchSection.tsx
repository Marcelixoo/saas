'use client';

import { FormEvent, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ApiError, type SearchParams } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FacetChip } from '@/components/ui/facet-chip';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
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
import { useSearch } from '@/lib/hooks/useSearch';
import { PageHeader } from './sections';

const PAGE_SIZE = 20;
const FACET_FIELDS = ['category'];

type SortMode = 'relevance' | 'price-asc' | 'price-desc';

/** Maps a sort mode to the API `sort` param — relevance sends none, so the
 * index's default relevancy ranking applies. */
function sortFor(mode: SortMode): string[] | undefined {
  if (mode === 'relevance') return undefined;
  return [`price:${mode === 'price-asc' ? 'asc' : 'desc'}`];
}

/**
 * Search preview section: query panel with category facets, a three-way sort
 * (relevance / price asc / price desc), and a results table (rank / product /
 * brand / category / relevance score / price), on top of the shared `useSearch`
 * SWR-mutation hook. Layout follows the .pen console.
 */
export default function SearchSection() {
  const { selectedOrg } = useActiveOrg();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const slug = selectedOrg?.slug;

  const { results, run, isSearching, error } = useSearch(slug);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [offset, setOffset] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  function buildParams(overrides: Partial<SearchParams> = {}): SearchParams {
    return {
      q: query,
      filter: category ? `category = "${category}"` : undefined,
      sort: sortFor(sortMode),
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
    runSearch({ filter: nextCategory ? `category = "${nextCategory}"` : undefined, offset: 0 });
  }

  function handleSortChange(nextMode: SortMode) {
    setSortMode(nextMode);
    runSearch({ sort: sortFor(nextMode) });
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
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title="Search preview"
        description="Run live queries against this organization's indexed catalog."
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Query</CardTitle>
          <span className="font-mono text-[11px] text-ink-faint">index: {selectedOrg.slug}</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
              aria-label="Sort results"
              value={sortMode}
              onChange={(e) => handleSortChange(e.target.value as SortMode)}
              className="w-auto"
            >
              <option value="relevance">Relevance</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
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
        </CardContent>
      </Card>

      <Card>
        <div data-testid="search-results">
          {!hasSearched ? (
            <EmptyState
              title="No search yet"
              description="Enter a query to preview results from this catalog."
            />
          ) : hits.length === 0 ? (
            <EmptyState title="No results" description="No products matched your query." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-32">Score</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hits.map((hit, index) => {
                  const imageUrl = typeof hit.imageUrl === 'string' ? hit.imageUrl : null;
                  const price = typeof hit.price === 'number' ? hit.price : null;
                  const brand = typeof hit.brand === 'string' ? hit.brand : null;
                  const category = typeof hit.category === 'string' ? hit.category : null;
                  const score = typeof hit._rankingScore === 'number' ? hit._rankingScore : null;
                  return (
                    <TableRow key={hit.id} data-testid="search-hit">
                      <TableCell className="font-mono text-ink-faint tabular-nums">
                        {offset + index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt={String(hit.title)}
                              loading="lazy"
                              className="size-9 shrink-0 rounded-sm bg-surface object-contain"
                            />
                          ) : null}
                          <span className="font-medium text-ink">{String(hit.title)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-ink-muted">{brand ?? '—'}</TableCell>
                      <TableCell className="text-ink-muted">{category ?? '—'}</TableCell>
                      <TableCell>
                        {score !== null ? (
                          <div className="flex items-center gap-2" title={`Relevance ${(score * 100).toFixed(1)}%`}>
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                              <span
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${Math.round(score * 100)}%` }}
                              />
                            </span>
                            <span
                              data-testid="search-hit-score"
                              className="font-mono text-[11px] tabular-nums text-ink-muted"
                            >
                              {(score * 100).toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {price !== null ? (
                          <span
                            data-testid="search-hit-price"
                            className="whitespace-nowrap font-semibold tabular-nums text-ink"
                          >
                            ${price.toFixed(2)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
              size="sm"
              type="button"
              disabled={currentPage <= 0}
              onClick={() => handlePageChange(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
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
          {query ? `Search for "${query}" failed.` : 'Search failed.'}
        </p>
      ) : null}
    </div>
  );
}
