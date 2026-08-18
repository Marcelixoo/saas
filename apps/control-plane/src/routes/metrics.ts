import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Errors } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership } from '../lib/membership';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 14;
const MIN_DAYS = 1;
const MAX_DAYS = 90;

const timeseriesQuerySchema = z.object({
  days: z.coerce.number().int().optional(),
});

/** UTC `YYYY-MM-DD` key for a given date. */
function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Metrics endpoints — owned by Agent A (Metrics).
 */
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // GET /organizations/:slug/usage/timeseries?days=14  (any member)
  app.get('/organizations/:slug/usage/timeseries', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const parsed = timeseriesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const rawDays = parsed.data.days ?? DEFAULT_DAYS;
    const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, rawDays));

    const { organization } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);

    const now = new Date();
    const todayKey = utcDateKey(now);
    const todayUtcStart = new Date(`${todayKey}T00:00:00.000Z`);
    // Window covers `days` days ending today (inclusive), so it starts
    // `days - 1` days before today's UTC midnight.
    const cutoff = new Date(todayUtcStart.getTime() - (days - 1) * MS_PER_DAY);

    const events = await app.deps.prisma.usageEvent.findMany({
      where: { organizationId: organization.id, createdAt: { gte: cutoff } },
      select: { createdAt: true, operation: true, statusCode: true },
    });

    const buckets = new Map<string, { search: number; index: number; rateLimited: number }>();
    for (let i = 0; i < days; i += 1) {
      const key = utcDateKey(new Date(cutoff.getTime() + i * MS_PER_DAY));
      buckets.set(key, { search: 0, index: 0, rateLimited: 0 });
    }

    for (const event of events) {
      const key = utcDateKey(event.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (event.operation === 'SEARCH' && event.statusCode === 429) {
        bucket.rateLimited += 1;
      } else if (event.operation === 'SEARCH' && event.statusCode < 400) {
        bucket.search += 1;
      } else if (event.operation === 'INDEX' && event.statusCode < 400) {
        bucket.index += 1;
      }
    }

    // `buckets` was seeded in ascending date order above, and Map iteration
    // preserves insertion order, so no further sorting is needed.
    const points = Array.from(buckets.entries()).map(([date, counts]) => ({ date, ...counts }));

    reply.code(200).send({
      organizationId: organization.id,
      days,
      points,
    });
  });
}
