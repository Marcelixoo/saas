import { test, expect } from '@playwright/test';
import { runId, uniqueEmail, E2E_PASSWORD } from './helpers';

/**
 * Acceptance Test A — Onboarding & search, exercised THROUGH THE BROWSER UI.
 *
 * An assessor with an allow-listed email can:
 *   register -> log in -> create an org (FREE) -> seed a catalog ->
 *   search a known product -> see the result -> see usage information.
 *
 * INTENTIONALLY RED until the Admin UI (Agent D) and control plane (Agent A)
 * exist. Couples only to agreed data-testid attributes, never CSS classes.
 */
test('assessor onboards through the UI and searches a seeded catalog', async ({ page }) => {
  const id = runId();
  const orgName = `Acme Shop ${id}`;
  const email = uniqueEmail(); // fresh, allow-listable identity per run

  // 1-3. Register + authenticate via the UI.
  await page.goto('/');
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(E2E_PASSWORD);
  await page.getByTestId('signup-submit').click();

  // 4. Create a unique organization.
  await page.getByTestId('organization-create').click();
  await page.getByTestId('organization-name').fill(orgName);
  await page.getByTestId('organization-submit').click();

  // 5. Confirm FREE plan (shown in the header for the active org).
  await expect(page.getByTestId('plan-badge')).toHaveText(/FREE/i);

  // 6. Seed the sample catalog (a 500-product slice of the real catalog) for
  // this org, from the Catalog tab. Seeding runs in a few chunked requests, so
  // allow extra time.
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('seed-catalog').click();
  await expect(page.getByTestId('catalog-seed-info')).toContainText(/Seeded/i, {
    timeout: 30000,
  });

  // 7-8. Search a known seeded product and confirm it appears, from the Search
  // tab. "Samsung" is a brand present in the committed sample catalog
  // (apps/web/lib/sample-catalog.ts). The search engine indexes asynchronously,
  // so a query issued immediately after seeding can legitimately return no hits
  // yet. Re-issue the search (bounded retry) until the freshly-seeded catalog
  // becomes searchable.
  await page.getByTestId('tab-search').click();
  await page.getByTestId('search-input').fill('Samsung');
  await expect(async () => {
    await page.getByTestId('search-submit').click();
    await expect(page.getByTestId('search-results')).toContainText(/samsung/i, {
      timeout: 2000,
    });
  }).toPass({ timeout: 20000 });

  // 9. Confirm usage information is visible on the Metrics tab.
  await page.getByTestId('tab-metrics').click();
  await expect(page.getByTestId('usage-search-count')).toBeVisible();
  await expect(page.getByTestId('usage-search-count')).not.toHaveText('0');
});
