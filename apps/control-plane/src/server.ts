import { config } from './config';
import { buildApp } from './app';
import { createPrismaClient } from './lib/prisma';
import { createRedisClient } from './lib/redis';
import { createSearchApiClient } from './lib/searchClient';

const INSECURE_DEFAULT_JWT_SECRET = 'dev-secret-change-me';

/**
 * Refuse to boot with the fallback JWT signing secret outside local dev.
 * Booting a public-facing auth service with a known, hardcoded secret would
 * let anyone forge valid tokens for any user/organization.
 */
function assertJwtSecretConfigured(): void {
  if (process.env.NODE_ENV === 'production' && config.jwtSecret === INSECURE_DEFAULT_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET must be set to a real secret in production (refusing to start with the insecure default).',
    );
  }
}

async function main(): Promise<void> {
  assertJwtSecretConfigured();

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
