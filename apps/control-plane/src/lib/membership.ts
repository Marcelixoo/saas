import type { PrismaClient } from '@prisma/client';
import { Errors } from './errors';

export interface ResolvedMembership {
  organization: { id: string; name: string; slug: string; plan: 'FREE' | 'PRO' };
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

/**
 * Resolves an organization slug to its trusted UUID and verifies the
 * requesting user is a member. This is the ONLY place tenant identity is
 * derived for downstream calls — never from client-supplied headers.
 */
export async function resolveMembership(
  prisma: PrismaClient,
  slug: string,
  userId: string,
): Promise<ResolvedMembership> {
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) {
    throw Errors.notFound('Organization not found');
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: organization.id } },
  });
  if (!membership) {
    throw Errors.unauthorized('You are not a member of this organization');
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
    },
    role: membership.role,
  };
}

export function requireRole(role: string, allowed: string[]): void {
  if (!allowed.includes(role)) {
    throw Errors.unauthorized('Your role does not permit this action');
  }
}
