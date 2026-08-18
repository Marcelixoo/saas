import type { FastifyInstance } from 'fastify';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership } from '../lib/membership';

/**
 * Metrics endpoints — owned by Agent A (Metrics).
 *
 * Scaffolded here so `app.ts` wiring is frozen and the page-agent only edits
 * this file. Replace the 501 body with the real implementation:
 * per-day usage counts via `prisma.usageEvent.groupBy` (see CONTRACT §3).
 */
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // GET /organizations/:slug/usage/timeseries?days=14  (any member)
  app.get('/organizations/:slug/usage/timeseries', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string };
    await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'usage timeseries endpoint not yet implemented');
  });
}
