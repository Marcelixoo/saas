import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { SearchApiClient } from './lib/searchClient';

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
  }
}
