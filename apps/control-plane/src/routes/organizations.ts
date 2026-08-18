import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Errors } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { resolveMembership, requireRole } from '../lib/membership';
import { generateSlug } from '../lib/slug';
import { checkAndIncrementRateLimit } from '../lib/redis';
import { config } from '../config';

const createOrgSchema = z.object({
  name: z.string().min(1),
});

const updatePlanSchema = z.object({
  plan: z.enum(['FREE', 'PRO']),
});

const batchDocumentSchema = z.object({
  documents: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        body: z.string().optional(),
        author: z.string().optional(),
        tags: z.array(z.string()).optional(),
        brand: z.string().optional(),
        category: z.string().optional(),
        price: z.number().nonnegative().optional(),
        imageUrl: z.string().url().optional(),
      }),
    )
    .min(1),
});

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/organizations', { preHandler: requireAuth }, async (request, reply) => {
    const memberships = await app.deps.prisma.membership.findMany({
      where: { userId: request.authUser!.id },
      include: { organization: true },
    });
    reply.code(200).send(
      memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        plan: m.organization.plan,
        role: m.role,
      })),
    );
  });

  app.post('/organizations', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { name } = parsed.data;
    const slug = generateSlug(name);

    const organization = await app.deps.prisma.organization.create({
      data: {
        name,
        slug,
        plan: 'FREE',
        memberships: {
          create: { userId: request.authUser!.id, role: 'OWNER' },
        },
      },
    });

    reply.code(201).send({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      role: 'OWNER',
    });
  });

  app.patch('/organizations/:slug/plan', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = updatePlanSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const { organization, role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);

    const updated = await app.deps.prisma.organization.update({
      where: { id: organization.id },
      data: { plan: parsed.data.plan },
    });

    reply.code(200).send({ id: updated.id, name: updated.name, slug: updated.slug, plan: updated.plan });
  });

  app.get('/organizations/:slug/usage', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { organization } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);

    const [searchCount, rateLimitedCount, indexCount] = await Promise.all([
      app.deps.prisma.usageEvent.count({
        where: { organizationId: organization.id, operation: 'SEARCH', statusCode: { lt: 400 } },
      }),
      app.deps.prisma.usageEvent.count({
        where: { organizationId: organization.id, operation: 'SEARCH', statusCode: 429 },
      }),
      app.deps.prisma.usageEvent.count({
        where: { organizationId: organization.id, operation: 'INDEX', statusCode: { lt: 400 } },
      }),
    ]);

    reply.code(200).send({
      organizationId: organization.id,
      searchCount,
      rateLimitedCount,
      indexCount,
    });
  });

  app.get('/organizations/:slug/search', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { q } = request.query as { q?: string };
    if (!q) {
      throw Errors.validation('Query parameter "q" is required');
    }

    const { organization } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);

    const limit = organization.plan === 'PRO' ? config.proSearchLimit : config.freeSearchLimit;
    const { allowed } = await checkAndIncrementRateLimit(app.deps.redis, organization.id, limit);

    if (!allowed) {
      await app.deps.prisma.usageEvent.create({
        data: {
          organizationId: organization.id,
          userId: request.authUser!.id,
          operation: 'SEARCH',
          statusCode: 429,
        },
      });
      throw Errors.rateLimited('Search rate limit exceeded for this organization');
    }

    try {
      const result = await app.deps.searchClient.search(organization.id, q);
      await app.deps.prisma.usageEvent.create({
        data: {
          organizationId: organization.id,
          userId: request.authUser!.id,
          operation: 'SEARCH',
          statusCode: 200,
        },
      });
      reply.code(200).send(result);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 502;
      await app.deps.prisma.usageEvent.create({
        data: {
          organizationId: organization.id,
          userId: request.authUser!.id,
          operation: 'SEARCH',
          statusCode,
        },
      });
      throw err;
    }
  });

  app.post('/organizations/:slug/documents/batch', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = batchDocumentSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const { organization, role } = await resolveMembership(app.deps.prisma, slug, request.authUser!.id);
    requireRole(role, ['OWNER', 'ADMIN']);

    try {
      const result = await app.deps.searchClient.indexBatch(organization.id, parsed.data.documents);
      await app.deps.prisma.usageEvent.create({
        data: {
          organizationId: organization.id,
          userId: request.authUser!.id,
          operation: 'INDEX',
          statusCode: 202,
        },
      });
      reply.code(202).send(result);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 502;
      await app.deps.prisma.usageEvent.create({
        data: {
          organizationId: organization.id,
          userId: request.authUser!.id,
          operation: 'INDEX',
          statusCode,
        },
      });
      throw err;
    }
  });
}
