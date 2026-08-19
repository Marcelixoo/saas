'use client';

import { useEffect } from 'react';
import useSWRMutation from 'swr/mutation';
import { search, type SearchParams, type SearchResponse } from '@/lib/api';

/**
 * Mutation hook (SWR) for running a catalog search. Unlike the read-only
 * query hooks, a search is explicitly triggered (query text, facet, sort, and
 * page changes all go through `run`), so this wraps `useSWRMutation` rather
 * than `useSWR`. `results` includes hits, `total`, and, when facets were
 * requested, `facetDistribution`.
 *
 * `useSWRMutation`'s `data` lives in local state owned by this hook instance,
 * NOT in the SWR cache keyed by `key` — so switching `slug` changes the key
 * used for the *next* `run()`, but does not clear the previous org's `data`.
 * Without the reset below, switching orgs kept showing the prior org's
 * search hits/total (e.g. 25) while every other panel already reflected the
 * newly selected org (e.g. 6), which is the root cause of the metrics/search
 * count mismatch. Resetting on `slug` change keeps this hook's results
 * scoped to the organization that's actually selected.
 */
export function useSearch(slug: string | null | undefined) {
  const key = slug ? `/organizations/${slug}/search` : null;
  const { data, error, isMutating, trigger, reset } = useSWRMutation<
    SearchResponse,
    Error,
    string | null,
    SearchParams
  >(key, (_key, { arg }) => search(slug!, arg));

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return { results: data ?? null, run: trigger, isSearching: isMutating, error };
}
