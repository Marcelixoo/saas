'use client';

import useSWR from 'swr';
import { swrFetcher, type UsageTimeseries } from '@/lib/api';

/**
 * Query hook (SWR) for an organization's per-day usage counts. Pass a falsy
 * slug to disable fetching (conditional fetching).
 */
export function useUsageTimeseries(slug: string | null | undefined, days = 14) {
  const key = slug ? `/organizations/${slug}/usage/timeseries?days=${days}` : null;
  const { data, error, isLoading } = useSWR<UsageTimeseries>(key, swrFetcher);
  return { points: data?.points ?? [], isLoading, error };
}
