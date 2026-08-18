'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Organization } from '@/lib/api';
import { useOrganizations } from './useOrganizations';

export type ActiveOrgValue = {
  organizations: Organization[];
  /** The effective selected slug (always valid against `organizations`, or ''). */
  selectedSlug: string;
  selectedOrg: Organization | null;
  setSelectedSlug: (slug: string) => void;
  isLoading: boolean;
  error: unknown;
  /** Revalidate the organizations list (e.g. after create/rename). */
  refresh: () => void;
};

const ActiveOrgContext = createContext<ActiveOrgValue | null>(null);

/**
 * Holds which organization the dashboard is scoped to. The selection is
 * *derived* during render from the (SWR-backed) org list plus a preferred
 * slug, so a stale selection can never point at an org that no longer
 * exists — no mirroring effect required.
 */
export function ActiveOrgProvider({ children }: { children: ReactNode }) {
  const { organizations, isLoading, error, mutate } = useOrganizations();
  const [preferredSlug, setPreferredSlug] = useState('');

  const selectedSlug =
    preferredSlug && organizations.some((o) => o.slug === preferredSlug)
      ? preferredSlug
      : organizations[0]?.slug ?? '';

  const selectedOrg = organizations.find((o) => o.slug === selectedSlug) ?? null;

  const value = useMemo<ActiveOrgValue>(
    () => ({
      organizations,
      selectedSlug,
      selectedOrg,
      setSelectedSlug: setPreferredSlug,
      isLoading,
      error,
      refresh: () => {
        mutate();
      },
    }),
    [organizations, selectedSlug, selectedOrg, isLoading, error, mutate],
  );

  return <ActiveOrgContext.Provider value={value}>{children}</ActiveOrgContext.Provider>;
}

export function useActiveOrg(): ActiveOrgValue {
  const ctx = useContext(ActiveOrgContext);
  if (!ctx) {
    throw new Error('useActiveOrg must be used within an ActiveOrgProvider');
  }
  return ctx;
}
