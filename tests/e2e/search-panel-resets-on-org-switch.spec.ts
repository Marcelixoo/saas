import { test, expect, request as pwRequest } from '@playwright/test';
import {
  API_URL,
  authenticate,
  authHeader,
  runId,
  uniqueEmail,
  E2E_PASSWORD,
} from './helpers';

/**
 * Regression test for the Metrics/Search count mismatch: the Search panel
 * kept the previous organization's hits on screen after switching orgs in
 * the sidebar, because `useSearch`'s `useSWRMutation` state lives in local
 * component state (not the SWR cache keyed by slug) and was never reset on
 * a slug change. That let the Search tab show a stale, larger count (e.g.
 * 25 hits from org A) side by side with a Metrics panel already reporting
 * org B's real (smaller) numbers.
 *
 * Drives the same UI flow as the onboarding test, but through TWO orgs.
 */
test('search panel drops the previous organization\'s results after switching orgs', async ({
  page,
}) => {
  const id = runId();
  const email = uniqueEmail();

  // Seed both orgs + a unique marker document in org A only, via the API,
  // so the test only has to exercise the UI's org-switch/search behavior.
  const ctx = await pwRequest.newContext();
  const token = await authenticate(ctx, email, E2E_PASSWORD);
  const orgAName = `Org A ${id}`;
  const orgBName = `Org B ${id}`;

  const orgA = await (
    await ctx.post(`${API_URL}/organizations`, { headers: authHeader(token), data: { name: orgAName } })
  ).json();
  const orgB = await (
    await ctx.post(`${API_URL}/organizations`, { headers: authHeader(token), data: { name: orgBName } })
  ).json();

  const marker = `ZZSWITCH${id}`;
  await ctx.post(`${API_URL}/organizations/${orgA.slug}/documents/batch`, {
    headers: authHeader(token),
    data: { documents: [{ id: `doc-${id}`, title: `${marker} Product`, brand: 'Nike', category: 'shoes' }] },
  });
  await new Promise((r) => setTimeout(r, 2000));
  await ctx.dispose();

  // Log in through the UI with the same credentials already registered above.
  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(E2E_PASSWORD);
  await page.getByTestId('login-submit').click();

  // Search org A for the marker product and confirm it's found.
  await page.getByTestId('organization-select').selectOption({ label: orgAName });
  await page.getByTestId('nav-search').click();
  await page.getByTestId('search-input').fill(marker);
  await expect(async () => {
    await page.getByTestId('search-submit').click();
    await expect(page.getByTestId('search-results')).toContainText(marker, { timeout: 2000 });
  }).toPass({ timeout: 20000 });

  // Switch to org B (which has no documents at all). The search panel must
  // NOT keep showing org A's hit — it should return to its pre-search state
  // rather than display stale cross-org results.
  await page.getByTestId('organization-select').selectOption({ label: orgBName });
  await expect(page.getByTestId('search-results')).not.toContainText(marker);
  await expect(page.getByTestId('search-input')).toHaveValue('');
});
