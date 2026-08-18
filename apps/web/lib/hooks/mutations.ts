'use client';

import useSWRMutation from 'swr/mutation';
import { useSWRConfig } from 'swr';
import {
  createOrganization,
  seedCatalog,
  updatePlan,
  type Organization,
  type Plan,
} from '@/lib/api';
import { SAMPLE_CATALOG } from '@/lib/sample-catalog';

/**
 * Mutation hooks (SWR) for control-plane writes. Each returns SWR-mutation's
 * `{ trigger, isMutating, error }` and invalidates the query caches its write
 * affects, so query hooks refresh without manual refetch wiring.
 */

export function useCreateOrganization() {
  const { mutate } = useSWRConfig();
  return useSWRMutation<Organization, Error, '/organizations', { name: string }>(
    '/organizations',
    (_key, { arg }) => createOrganization(arg.name),
    {
      revalidate: false,
      onSuccess: () => {
        mutate('/organizations');
      },
    },
  );
}

export function useUpdatePlan(slug: string) {
  const { mutate } = useSWRConfig();
  return useSWRMutation<Organization, Error, string | null, { plan: Plan }>(
    slug ? `/organizations/${slug}/plan` : null,
    (_key, { arg }) => updatePlan(slug, arg.plan),
    {
      revalidate: false,
      onSuccess: () => {
        mutate('/organizations');
      },
    },
  );
}

export function useSeedCatalog(slug: string) {
  const { mutate } = useSWRConfig();
  return useSWRMutation<{ accepted: number }, Error, string | null>(
    slug ? `/organizations/${slug}/documents/batch` : null,
    () => seedCatalog(slug, SAMPLE_CATALOG),
    {
      revalidate: false,
      onSuccess: () => {
        if (slug) mutate(`/organizations/${slug}/usage`);
      },
    },
  );
}
