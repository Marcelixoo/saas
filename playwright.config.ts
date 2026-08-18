import { defineConfig, devices } from '@playwright/test';

/**
 * System-level acceptance suite for the multi-tenant search SaaS platform.
 *
 * This suite is INTENTIONALLY RED at bootstrap time: the features it exercises
 * do not exist yet. As feature PRs land, failures turn green. The final gate
 * requires this suite fully green against the deployed (k8s) environment.
 *
 * Environment:
 *   E2E_BASE_URL  Admin UI base URL       (default http://localhost:3000)
 *   E2E_API_URL   Fastify control plane   (default http://localhost:8080)
 *   E2E_EMAIL     allow-listed signup email for the run
 *   E2E_PASSWORD  password for the run
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
