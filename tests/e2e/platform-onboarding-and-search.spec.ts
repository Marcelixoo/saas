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

  // 5. Confirm FREE plan.
  await expect(page.getByTestId('plan-badge')).toHaveText(/FREE/i);

  // 6. Seed the synthetic catalog for this org.
  await page.getByTestId('seed-catalog').click();

  // 7-8. Search a known seeded product and confirm it appears.
  await page.getByTestId('search-input').fill('Nike');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('search-results')).toContainText(/nike/i);

  // 9. Confirm usage information is visible.
  await expect(page.getByTestId('usage-search-count')).toBeVisible();
  await expect(page.getByTestId('usage-search-count')).not.toHaveText('0');
});
