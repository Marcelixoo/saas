import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cleanDatabase, closeTestApp, registerAndLogin, type TestContext } from './helpers';

describe('metrics', () => {
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

  async function createOrg(token: string, name = 'Acme Shop') {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name },
    });
    return JSON.parse(res.body) as { id: string; slug: string };
  }

  it('returns dense, zero-filled points ascending by date', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { id: organizationId, slug } = await createOrg(token);

    // Seed a handful of events for "today" (UTC) so at least one bucket is non-zero.
    await ctx.prisma.usageEvent.createMany({
      data: [
        { organizationId, operation: 'SEARCH', statusCode: 200 },
        { organizationId, operation: 'SEARCH', statusCode: 200 },
        { organizationId, operation: 'SEARCH', statusCode: 429 },
        { organizationId, operation: 'INDEX', statusCode: 202 },
        { organizationId, operation: 'INDEX', statusCode: 500 },
      ],
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?days=7`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.organizationId).toBe(organizationId);
    expect(body.days).toBe(7);
    expect(body.points).toHaveLength(7);

    const dates = body.points.map((p: { date: string }) => p.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(7);

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayPoint = body.points.find((p: { date: string }) => p.date === todayKey);
    expect(todayPoint).toEqual({ date: todayKey, search: 2, index: 1, rateLimited: 1 });

    for (const point of body.points) {
      if (point.date === todayKey) continue;
      expect(point).toEqual({ date: point.date, search: 0, index: 0, rateLimited: 0 });
    }
  });

  it('defaults days to 14 when omitted', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.days).toBe(14);
    expect(body.points).toHaveLength(14);
  });

  it('returns 401 without auth', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a non-member', async () => {
    const owner = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(owner.token);

    const outsider = await registerAndLogin(ctx, 'someone@allowed-domain.test');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for a non-numeric days value', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?days=banana`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('clamps out-of-range days into [1, 90]', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(token);

    const tooMany = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?days=500`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tooMany.statusCode).toBe(200);
    expect(JSON.parse(tooMany.body).days).toBe(90);

    const tooFew = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?days=0`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tooFew.statusCode).toBe(200);
    expect(JSON.parse(tooFew.body).days).toBe(1);
  });
});
