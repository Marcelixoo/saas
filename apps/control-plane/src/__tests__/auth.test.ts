import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cleanDatabase, closeTestApp, type TestContext } from './helpers';

describe('auth', () => {
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

  it('registers an allow-listed email', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'allowed@e2e.test', password: 'password123', name: 'Allowed User' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('allowed@e2e.test');
    expect(body.token).toBeTypeOf('string');
  });

  it('registers a full-email allowlist match case-insensitively', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ALLOWED@E2E.TEST', password: 'password123', name: 'Case Insensitive' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('registers a domain-allowlisted email', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'someone@allowed-domain.test', password: 'password123', name: 'Domain User' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects a non-allow-listed email', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'nope@blocked.test', password: 'password123', name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid payloads with 400', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'short', name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('logs in with correct credentials and returns a token', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'allowed@e2e.test', password: 'password123', name: 'Allowed User' },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'allowed@e2e.test', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toBeTypeOf('string');
  });

  it('rejects login with wrong password with 401', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'allowed@e2e.test', password: 'password123', name: 'Allowed User' },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'allowed@e2e.test', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for /me without a JWT', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user for /me with a valid JWT', async () => {
    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'allowed@e2e.test', password: 'password123', name: 'Allowed User' },
    });
    const { token } = JSON.parse(registerRes.body);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).email).toBe('allowed@e2e.test');
  });
});
