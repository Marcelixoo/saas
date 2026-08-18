'use client';

import useSWR from 'swr';
import { swrFetcher, type Organization } from '@/lib/api';

/**
 * Query hook (SWR) for the organizations the current user belongs to.
 * Keyed by the raw control-plane path so any mutation can invalidate it
 * with `mutate('/organizations')`.
 */
export function useOrganizations() {
  const { data, error, isLoading, mutate } = useSWR<Organization[]>(
    '/organizations',
    swrFetcher,
  );
  return { organizations: data ?? [], isLoading, error, mutate };
}
