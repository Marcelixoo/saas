import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  classifySearchSli,
  SEARCH_SLI_LOG_MESSAGE,
  SEARCH_SLI_OPERATION,
} from '../lib/searchSli';
import { buildTestApp, cleanDatabase, closeTestApp, registerAndLogin, type TestContext } from './helpers';

describe('classifySearchSli', () => {
  it('treats 2xx and 3xx as good samples', () => {
    expect(classifySearchSli(200)).toBe('good');
    expect(classifySearchSli(201)).toBe('good');
    expect(classifySearchSli(204)).toBe('good');
    expect(classifySearchSli(301)).toBe('good');
  });

  it('excludes 4xx, including quota 429s, from the SLO', () => {
    expect(classifySearchSli(400)).toBe('excluded');
    expect(classifySearchSli(401)).toBe('excluded');
    expect(classifySearchSli(403)).toBe('excluded');
    expect(classifySearchSli(404)).toBe('excluded');
    expect(classifySearchSli(429)).toBe('excluded');
  });

  it('treats 5xx as availability failures', () => {
    expect(classifySearchSli(500)).toBe('error');
    expect(classifySearchSli(502)).toBe('error');
    expect(classifySearchSli(503)).toBe('error');
  });

  it('treats anything outside 2xx-4xx as an error', () => {
    expect(classifySearchSli(0)).toBe('error');
    expect(classifySearchSli(100)).toBe('error');
  });
});

function collectLogStream(lines: Record<string, unknown>[]) {
  return new Writable({
    write(chunk, _enc, cb) {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          lines.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // pino may emit a non-JSON banner in some configs; ignore it.
        }
      }
      cb();
    },
  });
}

function sliLines(logs: Record<string, unknown>[]): Record<string, unknown>[] {
  return logs.filter(
    (line) => line.msg === SEARCH_SLI_LOG_MESSAGE && line.sli_operation === SEARCH_SLI_OPERATION,
  );
}

describe('search SLI log line', () => {
  let ctx: TestContext;
  let logs: Record<string, unknown>[];

  beforeAll(async () => {
    logs = [];
    ctx = await buildTestApp({ logger: { level: 'info', stream: collectLogStream(logs) } });
  });

  afterEach(async () => {
    await cleanDatabase(ctx.prisma);
    ctx.searchClient.calls.search.length = 0;
    logs.length = 0;
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
    return JSON.parse(res.body) as { id: string; slug: string; plan: string };
  }

  it('emits a good line labeled with tenant_id and FREE plan', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(token);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search?q=nike`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    const sli = sliLines(logs);
    expect(sli).toHaveLength(1);
    expect(sli[0]).toMatchObject({
      sli_operation: 'search',
      tenant_id: org.id,
      plan: 'FREE',
      http_status: 200,
      sli_result: 'good',
    });
    expect(typeof sli[0].latency_ms).toBe('number');
    expect(sli[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('labels a PRO org with the plan in force at request time', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(token);
    const upgraded = await ctx.app.inject({
      method: 'PATCH',
      url: `/organizations/${org.slug}/plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { plan: 'PRO' },
    });
    expect(upgraded.statusCode).toBe(200);

    logs.length = 0;
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search?q=nike`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(sliLines(logs)[0]).toMatchObject({ tenant_id: org.id, plan: 'PRO', sli_result: 'good' });
  });

  it('emits excluded for a 429 once the FREE quota is exhausted', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(token);

    for (let i = 0; i < 3; i++) {
      const ok = await ctx.app.inject({
        method: 'GET',
        url: `/organizations/${org.slug}/search?q=nike`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(ok.statusCode).toBe(200);
    }
    logs.length = 0;

    const limited = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search?q=nike`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(limited.statusCode).toBe(429);
    expect(sliLines(logs)).toEqual([
      expect.objectContaining({
        tenant_id: org.id,
        plan: 'FREE',
        http_status: 429,
        sli_result: 'excluded',
      }),
    ]);
  });

  it('emits error when search-api is unavailable', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(token);
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
    expect(sliLines(logs)[0]).toMatchObject({
      tenant_id: org.id,
      http_status: 503,
      sli_result: 'error',
    });

    ctx.searchClient.search = originalSearch;
  });

  it('does not emit an SLI line when auth fails before a tenant is known', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/organizations/acme-shop/search?q=nike',
    });
    expect(res.statusCode).toBe(401);
    expect(sliLines(logs)).toHaveLength(0);
  });

  it('does not emit an SLI line for a 400 that fails query validation', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(token);
    logs.length = 0;

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/organizations/${org.slug}/search`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(sliLines(logs)).toHaveLength(0);
  });

  it('does not emit an SLI line for documents/batch', async () => {
    const { token } = await registerAndLogin(ctx, 'allowed@e2e.test');
    const org = await createOrg(token);
    logs.length = 0;

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/organizations/${org.slug}/documents/batch`,
      headers: { authorization: `Bearer ${token}` },
      payload: { documents: [{ id: 'sku-1', title: 'Red Nike Shoe' }] },
    });
    expect(res.statusCode).toBe(202);
    expect(sliLines(logs)).toHaveLength(0);
  });
});
