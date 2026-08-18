'use client';

import useSWR from 'swr';
import { swrFetcher, type CurrentUser } from '@/lib/api';

/** Query hook (SWR) for the currently authenticated user. */
export function useMe() {
  const { data, error, isLoading } = useSWR<CurrentUser>('/me', swrFetcher);
  return { user: data ?? null, isLoading, error };
}
