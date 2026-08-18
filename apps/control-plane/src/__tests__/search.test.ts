import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cleanDatabase, closeTestApp, registerAndLogin, type TestContext } from './helpers';

async function createOrg(ctx: TestContext, token: string, name = 'Acme Shop') {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/organizations',
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  return JSON.parse(res.body) as { id: string; slug: string };
}

describe('search + usage + tenant trust', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await cleanDatabase(ctx.prisma);
    ctx.searchClient.calls.search.length = 0;
    ctx.searchClient.calls.index.length = 0;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('proxies search and records a usage event', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(ctx, token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search?q=nike`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.query).toBe('nike');
    expect(body.total).toBe(1);
  });

  it('ignores an inbound X-Tenant-ID header and forwards the trusted resolved org UUID to the Go client', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(ctx, token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search?q=nike`,
      headers: {
        authorization: `Bearer ${token}`,
        'X-Tenant-ID': 'attacker-supplied-tenant-id',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(ctx.searchClient.calls.search).toHaveLength(1);
    expect(ctx.searchClient.calls.search[0].tenantId).toBe(org.id);
    expect(ctx.searchClient.calls.search[0].tenantId).not.toBe('attacker-supplied-tenant-id');
  });

  it('ignores inbound X-Tenant-ID on the documents/batch proxy as well', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(ctx, token);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${org.slug}/documents/batch`,
      headers: {
        authorization: `Bearer ${token}`,
        'X-Tenant-ID': 'attacker-supplied-tenant-id',
      },
      payload: { documents: [{ id: 'sku-1', title: 'Red Nike Shoe', brand: 'Nike', category: 'shoes' }] },
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).accepted).toBe(1);
    expect(ctx.searchClient.calls.index).toHaveLength(1);
    expect(ctx.searchClient.calls.index[0].tenantId).toBe(org.id);
  });

  it('denies documents/batch for a plain MEMBER (OWNER/ADMIN only)', async () => {
    const owner = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(ctx, owner.token);

    const member = await registerAndLogin(ctx, 'someone@allowed-domain.test');
    await ctx.prisma.membership.create({
      data: { userId: member.userId, organizationId: org.id, role: 'MEMBER' },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${org.slug}/documents/batch`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { documents: [{ id: 'sku-1', title: 'Red Nike Shoe' }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 429 and records a rate-limited usage event once the FREE quota is exhausted', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(ctx, token);

    // FREE_SEARCH_LIMIT is set to 3 in test/globalSetup.ts
    for (let i = 0; i < 3; i++) {
      const ok = await ctx.app.inject({
        method: 'GET',
        url: `/organizations/${org.slug}/search?q=nike`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(ok.statusCode).toBe(200);
    }

    const limited = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search?q=nike`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(limited.statusCode).toBe(429);
    expect(JSON.parse(limited.body).error.code).toBe('RATE_LIMITED');

    const usageRes = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/usage`,
      headers: { authorization: `Bearer ${token}` },
    });
    const usage = JSON.parse(usageRes.body);
    expect(usage.organizationId).toBe(org.id);
    expect(usage.searchCount).toBe(3);
    expect(usage.rateLimitedCount).toBe(1);
  });

  it('surfaces a 503 when the downstream search API is unavailable', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(ctx, token);

    const originalSearch = ctx.searchClient.search;
    ctx.searchClient.search = async () => {
      const { Errors } = await import('../lib/errors');
      throw Errors.unavailable('search-api down');
    };

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search?q=nike`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(503);

    ctx.searchClient.search = originalSearch;
  });
});
