import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Errors } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership, requireRole } from '../lib/membership';

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']),
});

const renameOrgSchema = z.object({
  name: z.string().min(1),
});

/**
 * Members CRUD + organization rename — owned by Agent D (Settings).
 */
export async function memberRoutes(app: FastifyInstance): Promise<void> {
  // GET /organizations/:slug/members  (any member)
  app.get('/organizations/:slug/members', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { organization } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);

    const memberships = await app.deps.prisma.membership.findMany({
      where: { organizationId: organization.id },
      include: { user: true },
    });

    reply.code(200).send({
      members: memberships.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
      })),
    });
  });

  // POST /organizations/:slug/members  (OWNER/ADMIN) — invite by email
  app.post('/organizations/:slug/members', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { organization, role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);

    const parsed = inviteMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { email, role: newRole } = parsed.data;

    const invitedUser = await app.deps.prisma.user.findUnique({ where: { email } });
    if (!invitedUser) {
      throw Errors.notFound('No registered user with that email');
    }

    const existing = await app.deps.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: invitedUser.id, organizationId: organization.id } },
    });
    if (existing) {
      throw Errors.conflict('This user is already a member of the organization');
    }

    const membership = await app.deps.prisma.membership.create({
      data: { userId: invitedUser.id, organizationId: organization.id, role: newRole },
    });

    reply.code(201).send({
      member: {
        userId: invitedUser.id,
        email: invitedUser.email,
        name: invitedUser.name,
        role: membership.role,
      },
    });
  });

  // DELETE /organizations/:slug/members/:userId  (OWNER/ADMIN)
  app.delete('/organizations/:slug/members/:userId', { preHandler: requireAuth }, async (request, reply) => {
    const { slug, userId } = request.params as { slug: string; userId: string };
    const { organization, role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);

    const target = await app.deps.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: organization.id } },
    });
    if (!target) {
      throw Errors.notFound('Membership not found');
    }

    if (target.role === 'OWNER') {
      const ownerCount = await app.deps.prisma.membership.count({
        where: { organizationId: organization.id, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        throw Errors.conflict('Cannot remove the last remaining owner');
      }
    }

    await app.deps.prisma.membership.delete({ where: { id: target.id } });

    reply.code(204).send();
  });

  // PATCH /organizations/:slug  (OWNER/ADMIN) — rename organization
  app.patch('/organizations/:slug', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { organization, role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);

    const parsed = renameOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const updated = await app.deps.prisma.organization.update({
      where: { id: organization.id },
      data: { name: parsed.data.name },
    });

    reply.code(200).send({ id: updated.id, name: updated.name, slug: updated.slug, plan: updated.plan });
  });
}
