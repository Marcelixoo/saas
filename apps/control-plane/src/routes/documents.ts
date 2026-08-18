import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Errors } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership } from '../lib/membership';

const listDocumentsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Catalog document listing — owned by Agent C (Catalog).
 *
 * Proxies to the internal Go `GET /internal/documents` endpoint, injecting
 * the trusted, server-resolved organization UUID as `X-Tenant-ID` (see
 * CONTRACT §3/§4). Any member of the organization may list documents.
 */
export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // GET /organizations/:slug/documents?offset=0&limit=20  (any member)
  app.get('/organizations/:slug/documents', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = listDocumentsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { offset, limit } = parsed.data;

    const { organization } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);

    const result = await app.deps.searchClient.listDocuments(organization.id, offset, limit);
    reply.code(200).send(result);
  });
}
