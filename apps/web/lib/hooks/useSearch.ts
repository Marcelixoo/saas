'use client';

import useSWRMutation from 'swr/mutation';
import { search, type SearchParams, type SearchResponse } from '@/lib/api';

/**
 * Mutation hook (SWR) for running a catalog search. Unlike the read-only
 * query hooks, a search is explicitly triggered (query text, facet, sort, and
 * page changes all go through `run`), so this wraps `useSWRMutation` rather
 * than `useSWR`. `results` includes hits, `total`, and, when facets were
 * requested, `facetDistribution`.
 */
export function useSearch(slug: string | null | undefined) {
  const key = slug ? `/organizations/${slug}/search` : null;
  const { data, error, isMutating, trigger } = useSWRMutation<
    SearchResponse,
    Error,
    string | null,
    SearchParams
  >(key, (_key, { arg }) => search(slug!, arg));

  return { results: data ?? null, run: trigger, isSearching: isMutating, error };
}
