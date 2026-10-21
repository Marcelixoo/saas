import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { SearchApiClient } from './lib/searchClient';
import type { SearchSliContext } from './lib/searchSli';

export interface AppDeps {
  prisma: PrismaClient;
  redis: Redis;
  searchClient: SearchApiClient;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }

  interface FastifyRequest {
    authUser?: { id: string; email: string };
    // Decorated in buildApp; null until a search handler resolves membership.
    searchSli: SearchSliContext | null;
  }
}
