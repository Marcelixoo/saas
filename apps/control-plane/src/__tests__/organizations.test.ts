import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cleanDatabase, closeTestApp, registerAndLogin, type TestContext } from './helpers';

describe('organizations', () => {
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

  it('creates an organization and makes the creator OWNER with FREE plan', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Acme Shop' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.plan).toBe('FREE');
    expect(body.role).toBe('OWNER');
    expect(body.slug).toContain('acme-shop');
  });

  it('lists organizations the user belongs to', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    await ctx.app.inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Acme Shop' },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/organizations',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].role).toBe('OWNER');
  });

  it('returns 401 creating an organization without auth', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/organizations', payload: { name: 'X' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when a non-member accesses an organization endpoint', async () => {
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
      url: `/organizations/${slug}/usage`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 for an unknown organization slug', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/organizations/does-not-exist/usage',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('allows OWNER to update plan but denies MEMBER', async () => {
    const owner = await registerAndLogin(ctx, 'allowed@e2e.test');
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Acme Shop' },
    });
    const { slug, id: organizationId } = JSON.parse(createRes.body);

    const member = await registerAndLogin(ctx, 'someone@allowed-domain.test');
    await ctx.prisma.membership.create({
      data: { userId: member.userId, organizationId, role: 'MEMBER' },
    });

    const denied = await ctx.app.inject({
      method: 'PATCH',
      url: `/organizations/${slug}/plan`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { plan: 'PRO' },
    });
    expect(denied.statusCode).toBe(403);

    const allowed = await ctx.app.inject({
      method: 'PATCH',
      url: `/organizations/${slug}/plan`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { plan: 'PRO' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body).plan).toBe('PRO');
  });
});
