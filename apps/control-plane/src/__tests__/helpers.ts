import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildApp } from '../app';
import type { SearchApiClient } from '../lib/searchClient';
import type { FastifyInstance } from 'fastify';

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  redis: Redis;
  searchClient: SearchApiClient & {
    calls: {
      search: Array<{ tenantId: string; query: string }>;
      index: Array<{ tenantId: string; documents: unknown[] }>;
      listDocuments: Array<{ tenantId: string; offset: number; limit: number }>;
    };
  };
}

export function createFakeSearchClient(): TestContext['searchClient'] {
  const calls: TestContext['searchClient']['calls'] = { search: [], index: [], listDocuments: [] };
  return {
    calls,
    async search(tenantId, query) {
      calls.search.push({ tenantId, query });
      return { query, hits: [{ id: 'sku-1', title: 'Red Nike Shoe' }], total: 1 };
    },
    async indexBatch(tenantId, documents) {
      calls.index.push({ tenantId, documents });
      return { accepted: documents.length };
    },
    // Catalog listing fake — separate block, owned by Agent C (Catalog).
    async listDocuments(tenantId, offset, limit) {
      calls.listDocuments.push({ tenantId, offset, limit });
      return {
        documents: [{ id: 'sku-1', title: 'Red Nike Shoe', price: 59.9, imageUrl: 'https://example.com/shoe.png' }],
        total: 1,
        offset,
        limit,
      };
    },
  };
}

export async function buildTestApp(): Promise<TestContext> {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:56479');
  const searchClient = createFakeSearchClient();

  const app = buildApp({ prisma, redis, searchClient });
  await app.ready();

  return { app, prisma, redis, searchClient };
}

export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.usageEvent.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.prisma.$disconnect();
  ctx.redis.disconnect();
}

export async function registerAndLogin(
  ctx: TestContext,
  email: string,
  password = 'password123',
  name = 'Test User',
): Promise<{ token: string; userId: string }> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password, name },
  });
  if (res.statusCode !== 201) {
    throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  }
  const body = JSON.parse(res.body);
  return { token: body.token, userId: body.user.id };
}
