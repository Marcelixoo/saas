import { config } from './config';
import { buildApp } from './app';
import { createPrismaClient } from './lib/prisma';
import { createRedisClient } from './lib/redis';
import { createSearchApiClient } from './lib/searchClient';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const redis = createRedisClient();
  const searchClient = createSearchApiClient();

  const app = buildApp({ prisma, redis, searchClient });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start control-plane', err);
  process.exit(1);
});
