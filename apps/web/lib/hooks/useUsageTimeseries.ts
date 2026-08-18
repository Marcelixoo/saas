'use client';

import useSWR from 'swr';
import { swrFetcher, type UsageWindow, type UsageWindowTimeseries } from '@/lib/api';

const REFRESH_INTERVAL_MS: Record<UsageWindow, number> = {
  '1h': 15_000,
  '3h': 30_000,
  '24h': 60_000,
  '7d': 60_000,
};

/**
 * Query hook (SWR) for an organization's fine-grained usage counts over a
 * small window (1h/3h/24h/7d), bucketed server-side at a resolution
 * appropriate to that window (see CONTRACT.md §3). Pass a falsy slug to
 * disable fetching (conditional fetching). Short windows refresh more often
 * so the line chart stays live.
 */
export function useUsageTimeseries(slug: string | null | undefined, usageWindow: UsageWindow) {
  const key = slug ? `/organizations/${slug}/usage/timeseries?window=${usageWindow}` : null;
  const { data, error, isLoading } = useSWR<UsageWindowTimeseries>(key, swrFetcher, {
    refreshInterval: REFRESH_INTERVAL_MS[usageWindow],
  });
  return { points: data?.points ?? [], isLoading, error };
}
