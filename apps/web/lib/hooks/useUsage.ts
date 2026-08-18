'use client';

import useSWR from 'swr';
import { swrFetcher, type Usage } from '@/lib/api';

/**
 * Query hook (SWR) for an organization's aggregate usage counts. Pass a
 * falsy slug to disable fetching (conditional fetching).
 */
export function useUsage(slug: string | null | undefined) {
  const key = slug ? `/organizations/${slug}/usage` : null;
  const { data, error, isLoading, mutate } = useSWR<Usage>(key, swrFetcher);
  return { usage: data ?? null, isLoading, error, mutate };
}
