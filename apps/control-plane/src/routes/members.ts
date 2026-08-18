import type { FastifyInstance } from 'fastify';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership, requireRole } from '../lib/membership';

/**
 * Members CRUD + organization rename — owned by Agent D (Settings).
 *
 * Scaffolded here so `app.ts` wiring is frozen and the page-agent only edits
 * this file. Replace the 501 bodies with the real implementations (see
 * CONTRACT §3). Auth/role guards are already in place: mutations require
 * OWNER/ADMIN, and invites must validate the email and never escalate the
 * caller's own role.
 */
export async function memberRoutes(app: FastifyInstance): Promise<void> {
  // GET /organizations/:slug/members  (any member)
  app.get('/organizations/:slug/members', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string };
    await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'members listing endpoint not yet implemented');
  });

  // POST /organizations/:slug/members  (OWNER/ADMIN) — invite by email
  app.post('/organizations/:slug/members', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string };
    const { role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'member invite endpoint not yet implemented');
  });

  // DELETE /organizations/:slug/members/:userId  (OWNER/ADMIN)
  app.delete('/organizations/:slug/members/:userId', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string; userId: string };
    const { role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'member removal endpoint not yet implemented');
  });

  // PATCH /organizations/:slug  (OWNER/ADMIN) — rename organization
  app.patch('/organizations/:slug', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string };
    const { role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'organization rename endpoint not yet implemented');
  });
}
