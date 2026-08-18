'use client';

import useSWRMutation from 'swr/mutation';
import { useSWRConfig } from 'swr';
import { updateOrganization, type Organization } from '@/lib/api';

/**
 * Mutation hook (SWR) to rename an organization. Invalidates the
 * `/organizations` list so the header/switcher and active-org context pick
 * up the new name.
 */
export function useUpdateOrganization(slug: string) {
  const { mutate } = useSWRConfig();
  return useSWRMutation<Organization, Error, string | null, { name: string }>(
    slug ? `/organizations/${slug}` : null,
    (_key, { arg }) => updateOrganization(slug, arg.name),
    {
      revalidate: false,
      onSuccess: () => {
        mutate('/organizations');
      },
    },
  );
}
