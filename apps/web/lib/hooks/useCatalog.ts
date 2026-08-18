'use client';

import useSWR from 'swr';
import { swrFetcher, type CatalogListResponse } from '@/lib/api';

export interface UseCatalogOptions {
  offset: number;
  limit: number;
}

/**
 * Query hook (SWR) for a paginated page of a tenant's indexed catalog
 * documents. Pass a falsy slug to disable fetching (conditional fetching).
 * Keyed on the raw control-plane path (including offset/limit) so each page
 * caches independently and a seed mutation can invalidate every page with
 * `mutate((key) => key?.startsWith(...))`.
 */
export function useCatalog(slug: string | null | undefined, { offset, limit }: UseCatalogOptions) {
  const key = slug ? `/organizations/${slug}/documents?offset=${offset}&limit=${limit}` : null;
  const { data, error, isLoading, mutate } = useSWR<CatalogListResponse>(key, swrFetcher);
  return {
    documents: data?.documents ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    mutate,
  };
}
