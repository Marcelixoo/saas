import { APIRequestContext } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL || 'http://localhost:8080';
export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
export const E2E_EMAIL = process.env.E2E_EMAIL || 'assessor@e2e.test';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'Passw0rd!e2e';

/** Unique suffix so orgs/slugs never collide across runs (no cleanup needed). */
export function runId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A unique, still-allow-listable signup email per run. Uses plus-addressing so
 * the allowlist can match on domain (e.g. `@e2e.test`) while every run gets a
 * fresh identity — avoids "email already registered" flakiness once data
 * persists. See CONTRACT.md §3 (allowlist supports domain entries).
 */
export function uniqueEmail(base = E2E_EMAIL): string {
  const [local, domain] = base.split('@');
  return `${local}+${runId()}@${domain}`;
}

/** Register (ignore-if-exists) then login, returning a bearer token. */
export async function authenticate(
  request: APIRequestContext,
  email: string,
  password: string,
  name = 'E2E User',
): Promise<string> {
  await request.post(`${API_URL}/auth/register`, {
    data: { email, password, name },
    failOnStatusCode: false,
  });
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(
      `login failed for ${email}: HTTP ${res.status()} — ${await res.text()}`,
    );
  }
  const body = await res.json().catch(() => null);
  if (!body || typeof body.token !== 'string') {
    throw new Error(
      `login response for ${email} did not contain a token: ${JSON.stringify(body)}`,
    );
  }
  return body.token;
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
