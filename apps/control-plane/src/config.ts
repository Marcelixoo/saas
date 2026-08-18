function parseCorsOrigins(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const origins = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return origins.length > 0 ? origins : undefined;
}

function parseAllowlist(raw: string | undefined): { emails: Set<string>; domains: Set<string> } {
  const emails = new Set<string>();
  const domains = new Set<string>();
  if (!raw) return { emails, domains };
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) continue;
    if (trimmed.startsWith('@')) {
      domains.add(trimmed);
    } else {
      emails.add(trimmed);
    }
  }
  return { emails, domains };
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  // Every JWT issued by the control plane carries an expiry (see app.ts,
  // where this is wired as the default `sign` option for @fastify/jwt).
  // Keeps compromised/leaked tokens useful for a bounded window only.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  searchApiUrl: process.env.SEARCH_API_URL ?? 'http://search-api:8081',
  freeSearchLimit: Number(process.env.FREE_SEARCH_LIMIT ?? 30),
  proSearchLimit: Number(process.env.PRO_SEARCH_LIMIT ?? 300),
  allowedSignupEmails: parseAllowlist(process.env.ALLOWED_SIGNUP_EMAILS),
  // Explicit CORS allowlist (comma-separated, case-sensitive origins), e.g.
  // "https://admin.example.com,https://app.example.com". When unset, the
  // app falls back to reflecting the request origin (`origin: true`) for
  // local-dev convenience — see app.ts. Production deployments should
  // always set this to a concrete allowlist rather than relying on the
  // reflect-all default.
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
};

export function isEmailAllowed(email: string): boolean {
  const lowered = email.toLowerCase();
  if (config.allowedSignupEmails.emails.size === 0 && config.allowedSignupEmails.domains.size === 0) {
    // No allowlist configured => allow all (useful for local dev without env set).
    return true;
  }
  if (config.allowedSignupEmails.emails.has(lowered)) return true;
  const atIndex = lowered.lastIndexOf('@');
  if (atIndex === -1) return false;
  const domain = `@${lowered.slice(atIndex + 1)}`;
  return config.allowedSignupEmails.domains.has(domain);
}
