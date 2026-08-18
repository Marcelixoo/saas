import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cleanDatabase, closeTestApp, registerAndLogin, type TestContext } from './helpers';

describe('documents', () => {
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

  it('lists documents for a member, proxying to the search API with the trusted tenant id', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Acme Shop' },
    });
    const { slug, id: organizationId } = JSON.parse(createRes.body);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/documents?offset=0&limit=20`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe('sku-1');
    expect(body.total).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(20);

    expect(ctx.searchClient.calls.listDocuments).toHaveLength(1);
    expect(ctx.searchClient.calls.listDocuments[0]).toEqual({
      tenantId: organizationId,
      offset: 0,
      limit: 20,
    });
  });

  it('applies default pagination when offset/limit are omitted', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Acme Shop' },
    });
    const { slug } = JSON.parse(createRes.body);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/documents`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.searchClient.calls.listDocuments.at(-1)).toEqual({
      tenantId: expect.any(String),
      offset: 0,
      limit: 20,
    });
  });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/organizations/some-org/documents',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when a non-member requests the catalog', async () => {
    const owner = await registerAndLogin(ctx, 'allowed@e2e.test');
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Acme Shop' },
    });
    const { slug } = JSON.parse(createRes.body);

    const outsider = await registerAndLogin(ctx, 'someone@allowed-domain.test');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/documents`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
