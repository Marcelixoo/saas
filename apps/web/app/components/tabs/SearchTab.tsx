'use client';

import { FormEvent, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ApiError, search, type SearchHit } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';

/**
 * Foundation Search tab: query + result list (image, title, price). Agent B
 * extends this with facets, sorting, and pagination via a `useSearch` hook.
 */
export default function SearchTab() {
  const { selectedOrg } = useActiveOrg();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  const slug = selectedOrg?.slug;

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setBusy(true);
    try {
      const result = await search(slug, { q: query });
      setHits(result.hits);
      mutate(`/organizations/${slug}/usage`);
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Search failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!selectedOrg) {
    return (
      <EmptyState
        title="No organization selected"
        description="Select an organization to search its catalog."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex items-center gap-2" onSubmit={handleSearch}>
        <SearchInput
          data-testid="search-input"
          placeholder="Search products…"
          aria-label="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="primary" type="submit" data-testid="search-submit" disabled={busy}>
          Search
        </Button>
      </form>

      <Card>
        <div data-testid="search-results" className="divide-y divide-line-soft">
          {hits === null ? (
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
    </div>
  );
}
