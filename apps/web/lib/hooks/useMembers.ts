'use client';

import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { useSWRConfig } from 'swr';
import { inviteMember, removeMember, swrFetcher, type Member, type MembersResponse, type Role } from '@/lib/api';

/**
 * Query hook (SWR) for an organization's member list. Keyed by the raw
 * control-plane path so invite/remove mutations can invalidate it.
 */
export function useMembers(slug: string) {
  const { data, error, isLoading, mutate } = useSWR<MembersResponse>(
    slug ? `/organizations/${slug}/members` : null,
    swrFetcher,
  );
  return { members: data?.members ?? [], isLoading, error, mutate };
}

export function useInviteMember(slug: string) {
  const { mutate } = useSWRConfig();
  return useSWRMutation<{ member: Member }, Error, string | null, { email: string; role: Role }>(
    slug ? `/organizations/${slug}/members` : null,
    (_key, { arg }) => inviteMember(slug, arg.email, arg.role),
    {
      revalidate: false,
      onSuccess: () => {
        if (slug) mutate(`/organizations/${slug}/members`);
      },
    },
  );
}

export function useRemoveMember(slug: string) {
  const { mutate } = useSWRConfig();
  return useSWRMutation<void, Error, string | null, { userId: string }>(
    slug ? `/organizations/${slug}/members` : null,
    (_key, { arg }) => removeMember(slug, arg.userId),
    {
      revalidate: false,
      onSuccess: () => {
        if (slug) mutate(`/organizations/${slug}/members`);
      },
    },
  );
}

// Re-exported so callers importing from this module can reference the shape
// without a second import from `@/lib/api`.
export type { Member };
