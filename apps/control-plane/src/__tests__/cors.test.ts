import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cleanDatabase, closeTestApp, type TestContext } from './helpers';

describe('cors', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('answers an OPTIONS preflight from an allowed origin with the allow headers', async () => {
    const origin = 'http://web.localtest.me:8088';
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/auth/register',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('includes access-control-allow-origin on a normal cross-origin request', async () => {
    const origin = 'http://web.localtest.me:8088';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin },
      payload: { email: 'allowed@e2e.test', password: 'password123', name: 'Cors Test' },
    });
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });
});
