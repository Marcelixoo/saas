import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cleanDatabase, closeTestApp, registerAndLogin, type TestContext } from './helpers';

describe('members', () => {
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

  it('lists members of an organization', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug } = await createOrg(owner.token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${slug}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ email: 'owner@allowed-domain.test', role: 'OWNER' });
  });

  it('invites an existing user as MEMBER', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug } = await createOrg(owner.token);
    await registerAndLogin(ctx, 'invitee@allowed-domain.test');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${slug}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'invitee@allowed-domain.test', role: 'MEMBER' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.member).toMatchObject({ email: 'invitee@allowed-domain.test', role: 'MEMBER' });
  });

  it('rejects inviting a member as OWNER', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug } = await createOrg(owner.token);
    await registerAndLogin(ctx, 'invitee@allowed-domain.test');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${slug}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'invitee@allowed-domain.test', role: 'OWNER' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects inviting an email that has no registered user', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug } = await createOrg(owner.token);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${slug}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'nobody@allowed-domain.test', role: 'MEMBER' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects inviting a user who is already a member', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug } = await createOrg(owner.token);
    await registerAndLogin(ctx, 'invitee@allowed-domain.test');

    await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${slug}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'invitee@allowed-domain.test', role: 'MEMBER' },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${slug}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'invitee@allowed-domain.test', role: 'MEMBER' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('forbids a MEMBER from inviting others', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug, id: organizationId } = await createOrg(owner.token);
    const member = await registerAndLogin(ctx, 'member@allowed-domain.test');
    await ctx.prisma.membership.create({
      data: { userId: member.userId, organizationId, role: 'MEMBER' },
    });
    await registerAndLogin(ctx, 'invitee@allowed-domain.test');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${slug}/members`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { email: 'invitee@allowed-domain.test', role: 'MEMBER' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('removes a member', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug, id: organizationId } = await createOrg(owner.token);
    const member = await registerAndLogin(ctx, 'member@allowed-domain.test');
    await ctx.prisma.membership.create({
      data: { userId: member.userId, organizationId, role: 'MEMBER' },
    });

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/organizations/${slug}/members/${member.userId}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('cannot remove the last remaining owner', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug, id: organizationId } = await createOrg(owner.token);
    void organizationId;

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/organizations/${slug}/members/${owner.userId}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });

    expect([400, 409]).toContain(res.statusCode);
  });

  it('renames an organization', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug } = await createOrg(owner.token);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/organizations/${slug}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Renamed Shop' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Renamed Shop');
    expect(body.slug).toBe(slug);
  });

  it('forbids non-OWNER/ADMIN from renaming an organization', async () => {
    const owner = await registerAndLogin(ctx, 'owner@allowed-domain.test');
    const { slug, id: organizationId } = await createOrg(owner.token);
    const member = await registerAndLogin(ctx, 'member@allowed-domain.test');
    await ctx.prisma.membership.create({
      data: { userId: member.userId, organizationId, role: 'MEMBER' },
    });

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/organizations/${slug}`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { name: 'Renamed Shop' },
    });

    expect(res.statusCode).toBe(403);
  });
});
