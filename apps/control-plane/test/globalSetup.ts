import { execSync, execFileSync } from 'node:child_process';

const PG_CONTAINER = 'control-plane-test-postgres';
const REDIS_CONTAINER = 'control-plane-test-redis';
const PG_PORT = 55532;
const REDIS_PORT = 56479;

const DATABASE_URL = `postgresql://postgres:test@localhost:${PG_PORT}/control_plane_test`;
const REDIS_URL = `redis://localhost:${REDIS_PORT}`;

function sh(cmd: string): void {
  execSync(cmd, { stdio: 'inherit' });
}

function removeIfExists(name: string): void {
  try {
    execSync(`docker rm -f ${name}`, { stdio: 'ignore' });
  } catch {
    // container did not exist, ignore
  }
}

async function waitForPostgres(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      execSync(`docker exec ${PG_CONTAINER} pg_isready -U postgres`, { stdio: 'ignore' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Postgres did not become ready in time');
}

async function waitForRedis(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      execSync(`docker exec ${REDIS_CONTAINER} redis-cli ping`, { stdio: 'ignore' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Redis did not become ready in time');
}

export async function setup(): Promise<void> {
  removeIfExists(PG_CONTAINER);
  removeIfExists(REDIS_CONTAINER);

  sh(
    `docker run -d --name ${PG_CONTAINER} -e POSTGRES_PASSWORD=test -e POSTGRES_DB=control_plane_test -p ${PG_PORT}:5432 postgres:16-alpine`,
  );
  sh(`docker run -d --name ${REDIS_CONTAINER} -p ${REDIS_PORT}:6379 redis:7-alpine`);

  await waitForPostgres();
  await waitForRedis();

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.REDIS_URL = REDIS_URL;
  process.env.JWT_SECRET = 'test-secret';
  process.env.ALLOWED_SIGNUP_EMAILS = 'allowed@e2e.test,@allowed-domain.test';
  process.env.FREE_SEARCH_LIMIT = '3';
  process.env.PRO_SEARCH_LIMIT = '10';

  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL },
  });
}

export async function teardown(): Promise<void> {
  removeIfExists(PG_CONTAINER);
  removeIfExists(REDIS_CONTAINER);
}
