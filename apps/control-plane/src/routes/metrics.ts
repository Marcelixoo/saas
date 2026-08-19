import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Errors } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership } from '../lib/membership';

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DEFAULT_DAYS = 14;
const MIN_DAYS = 1;
const MAX_DAYS = 90;

/** Small-window granularity: how a `window` value is bucketed. */
const WINDOWS = {
  '1h': { rangeMs: MS_PER_HOUR, bucketMs: 5 * MS_PER_MINUTE },
  '3h': { rangeMs: 3 * MS_PER_HOUR, bucketMs: 15 * MS_PER_MINUTE },
  '24h': { rangeMs: 24 * MS_PER_HOUR, bucketMs: MS_PER_HOUR },
  '7d': { rangeMs: 7 * MS_PER_DAY, bucketMs: MS_PER_DAY },
} as const;
type WindowKey = keyof typeof WINDOWS;

const timeseriesQuerySchema = z.object({
  days: z.coerce.number().int().optional(),
  window: z.enum(['1h', '3h', '24h', '7d']).optional(),
});

/** UTC `YYYY-MM-DD` key for a given date. */
function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type Counts = { search: number; index: number; rateLimited: number };

function emptyCounts(): Counts {
  return { search: 0, index: 0, rateLimited: 0 };
}

function tallyEvent(bucket: Counts, event: { operation: string; statusCode: number }): void {
  if (event.operation === 'SEARCH' && event.statusCode === 429) {
    bucket.rateLimited += 1;
  } else if (event.operation === 'SEARCH' && event.statusCode < 400) {
    bucket.search += 1;
  } else if (event.operation === 'INDEX' && event.statusCode < 400) {
    bucket.index += 1;
  }
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

    const { organization } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);

    // `window` is the newer, finer-grained mode (1h/3h/24h/7d, bucketed at a
    // sub-day resolution and rendered as a line chart). Its presence takes
    // priority. Without it, fall back to the original `days`-bucketed-by-day
    // behavior unchanged, so existing callers keep working.
    if (parsed.data.window) {
      const window = parsed.data.window as WindowKey;
      const { rangeMs, bucketMs } = WINDOWS[window];
      const bucketCount = rangeMs / bucketMs;

      const now = new Date();
      // Align the window to the bucket grid so bucket boundaries are stable
      // (e.g. every 5 minutes on the clock) rather than drifting with the
      // exact request timestamp. Anchor on the END of the window (rounded UP
      // to the next bucket boundary) rather than the start — flooring the
      // start instead would round the whole window backwards in time and
      // could drop the most recent bucket's events (the very ones a "last
      // hour" chart most needs).
      const endMs = Math.ceil(now.getTime() / bucketMs) * bucketMs;
      const cutoffMs = endMs - rangeMs;

      const events = await app.deps.prisma.usageEvent.findMany({
        where: { organizationId: organization.id, createdAt: { gte: new Date(cutoffMs) } },
        select: { createdAt: true, operation: true, statusCode: true },
      });

      const buckets: Counts[] = Array.from({ length: bucketCount }, emptyCounts);
      for (const event of events) {
        const index = Math.floor((event.createdAt.getTime() - cutoffMs) / bucketMs);
        if (index < 0 || index >= bucketCount) continue;
        tallyEvent(buckets[index]!, event);
      }

      const points = buckets.map((counts, index) => ({
        ts: new Date(cutoffMs + index * bucketMs).toISOString(),
        ...counts,
      }));

      reply.code(200).send({
        organizationId: organization.id,
        window,
        points,
      });
      return;
    }

    const rawDays = parsed.data.days ?? DEFAULT_DAYS;
    const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, rawDays));

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

    const buckets = new Map<string, Counts>();
    for (let i = 0; i < days; i += 1) {
      const key = utcDateKey(new Date(cutoff.getTime() + i * MS_PER_DAY));
      buckets.set(key, emptyCounts());
    }

    for (const event of events) {
      const key = utcDateKey(event.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      tallyEvent(bucket, event);
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
