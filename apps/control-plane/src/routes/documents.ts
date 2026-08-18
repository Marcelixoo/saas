import type { FastifyInstance } from 'fastify';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership } from '../lib/membership';

/**
 * Catalog document listing — owned by Agent C (Catalog).
 *
 * Scaffolded here so `app.ts` wiring is frozen and the page-agent only edits
 * this file. Replace the 501 body with a paginated proxy to the Go
 * `GET /internal/documents` endpoint (see CONTRACT §3/§4).
 */
export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // GET /organizations/:slug/documents?offset=0&limit=20  (any member)
  app.get('/organizations/:slug/documents', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string };
    await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'documents listing endpoint not yet implemented');
  });
}
