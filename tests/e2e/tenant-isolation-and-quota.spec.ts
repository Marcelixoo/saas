import { test, expect, request as pwRequest } from '@playwright/test';
import {
  API_URL,
  authenticate,
  authHeader,
  runId,
  E2E_EMAIL,
  E2E_PASSWORD,
} from './helpers';

/**
 * Acceptance Test B — Tenant isolation, header-spoofing safety, and quota.
 *
 * Uses APIRequestContext for the repetitive multi-tenant operations. Only
 * public application interfaces are touched — never Go/Meilisearch/PG/Redis
 * directly.
 *
 * INTENTIONALLY RED until control plane (Agent A) + Go tenancy (Agent B) land.
 */

async function createOrg(ctx: any, token: string, name: string) {
  const res = await ctx.post(`${API_URL}/organizations`, {
    headers: authHeader(token),
    data: { name },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test('tenant data is isolated and a forged X-Tenant-ID cannot bypass it', async () => {
  const ctx = await pwRequest.newContext();
  const token = await authenticate(ctx, E2E_EMAIL, E2E_PASSWORD);
  const id = runId();

  const a = await createOrg(ctx, token, `Tenant A ${id}`);
  const b = await createOrg(ctx, token, `Tenant B ${id}`);

  const marker = `ZZUNIQUE${id}`;
  // Index a unique document into Tenant A only.
  const idxRes = await ctx.post(`${API_URL}/organizations/${a.slug}/documents/batch`, {
    headers: authHeader(token),
    data: { documents: [{ id: `doc-${id}`, title: `${marker} Product`, brand: 'Nike', category: 'shoes' }] },
  });
  expect(idxRes.ok()).toBeTruthy();

  // Give the search engine a moment to index.
  await new Promise((r) => setTimeout(r, 2000));

  // Tenant A finds it.
  const hitRes = await ctx.get(`${API_URL}/organizations/${a.slug}/search?q=${marker}`, {
    headers: authHeader(token),
  });
  expect((await hitRes.json()).total).toBeGreaterThan(0);

  // Tenant B does NOT.
  const missRes = await ctx.get(`${API_URL}/organizations/${b.slug}/search?q=${marker}`, {
    headers: authHeader(token),
  });
  expect((await missRes.json()).total).toBe(0);

  // Forged external X-Tenant-ID (pointing at A's UUID) while operating on B
  // must NOT leak Tenant A data. Fastify overwrites the header with B's UUID.
  const spoofRes = await ctx.get(`${API_URL}/organizations/${b.slug}/search?q=${marker}`, {
    headers: { ...authHeader(token), 'X-Tenant-ID': a.id },
  });
  expect((await spoofRes.json()).total).toBe(0);

  await ctx.dispose();
});

test('FREE plan hits 429 and PRO plan allows a higher quota', async () => {
  const ctx = await pwRequest.newContext();
  const token = await authenticate(ctx, E2E_EMAIL, E2E_PASSWORD);
  const id = runId();

  const org = await createOrg(ctx, token, `Quota Org ${id}`);

  // Hammer search on a FREE org until 429. Acceptance env uses small limits.
  let got429 = false;
  let freeSuccesses = 0;
  for (let i = 0; i < 50; i++) {
    const r = await ctx.get(`${API_URL}/organizations/${org.slug}/search?q=anything`, {
      headers: authHeader(token),
    });
    if (r.status() === 429) {
      got429 = true;
      break;
    }
    if (r.ok()) freeSuccesses++;
  }
  expect(got429).toBeTruthy();

  // Upgrade to PRO; the configured limit must be strictly larger.
  const planRes = await ctx.patch(`${API_URL}/organizations/${org.slug}/plan`, {
    headers: authHeader(token),
    data: { plan: 'PRO' },
  });
  expect(planRes.ok()).toBeTruthy();

  // New window: PRO should allow more than FREE did before 429.
  await new Promise((r) => setTimeout(r, 61_000));
  let proSuccesses = 0;
  for (let i = 0; i < 50; i++) {
    const r = await ctx.get(`${API_URL}/organizations/${org.slug}/search?q=anything`, {
      headers: authHeader(token),
    });
    if (r.status() === 429) break;
    if (r.ok()) proSuccesses++;
  }
  expect(proSuccesses).toBeGreaterThan(freeSuccesses);

  await ctx.dispose();
});
