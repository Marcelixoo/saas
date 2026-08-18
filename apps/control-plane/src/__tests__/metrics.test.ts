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

  it('buckets a 1h window into 12 five-minute points', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { id: organizationId, slug } = await createOrg(token);

    // Same instant for all 4 events so they always land in the same 5-minute
    // bucket regardless of exactly where the grid boundary falls relative to
    // "now" (bucket boundaries are aligned to the bucket grid, not to "now").
    const sameInstant = new Date(Date.now() - 60_000);
    await ctx.prisma.usageEvent.createMany({
      data: [
        { organizationId, operation: 'SEARCH', statusCode: 200, createdAt: sameInstant },
        { organizationId, operation: 'SEARCH', statusCode: 200, createdAt: sameInstant },
        { organizationId, operation: 'SEARCH', statusCode: 429, createdAt: sameInstant },
        { organizationId, operation: 'INDEX', statusCode: 202, createdAt: sameInstant },
      ],
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?window=1h`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.organizationId).toBe(organizationId);
    expect(body.window).toBe('1h');
    expect(body.points).toHaveLength(12);

    const timestamps = body.points.map((p: { ts: string }) => p.ts);
    expect(timestamps).toEqual([...timestamps].sort());
    expect(new Set(timestamps).size).toBe(12);

    const total = body.points.reduce(
      (acc: number, p: { search: number; index: number; rateLimited: number }) =>
        acc + p.search + p.index + p.rateLimited,
      0,
    );
    expect(total).toBe(4);
    // All 4 events landed in a single 5-minute bucket.
    const nonEmpty = body.points.filter(
      (p: { search: number; index: number; rateLimited: number }) =>
        p.search + p.index + p.rateLimited > 0,
    );
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0]).toMatchObject({ search: 2, index: 1, rateLimited: 1 });
  });

  it('buckets a 3h window into 12 fifteen-minute points and a 24h window into 24 hourly points', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(token);

    const res3h = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?window=3h`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res3h.statusCode).toBe(200);
    const body3h = JSON.parse(res3h.body);
    expect(body3h.window).toBe('3h');
    expect(body3h.points).toHaveLength(12);
    for (const point of body3h.points) {
      expect(point).toMatchObject({ search: 0, index: 0, rateLimited: 0 });
      expect(typeof point.ts).toBe('string');
    }

    const res24h = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?window=24h`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res24h.statusCode).toBe(200);
    const body24h = JSON.parse(res24h.body);
    expect(body24h.window).toBe('24h');
    expect(body24h.points).toHaveLength(24);
  });

  it('buckets a 7d window into 7 one-day points', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?window=7d`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.window).toBe('7d');
    expect(body.points).toHaveLength(7);
  });

  it('rejects an invalid window value with 400', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const { slug } = await createOrg(token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/usage/timeseries?window=5m`,
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
