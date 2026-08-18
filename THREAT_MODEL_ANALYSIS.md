# Threat Model Analysis

This document reflects the platform as actually built and deployed, not an
aspirational design. See `CONTRACT.md` for the frozen cross-team interface
this analysis is scoped to.

## 1. System Context

A multi-tenant search SaaS platform composed of two public services and four
internal-only services:

```
Browser / Load Generator
          |
   Ingress / Gateway
      |         |
   Next.js    Fastify   (PUBLIC)
   Admin UI   Control Plane
                 |
        +--------+---------+
        |        |         |
   PostgreSQL   Redis    Go Search API   (INTERNAL / ClusterIP only)
                            |
                       Meilisearch       (INTERNAL)
```

- **Public** (Ingress-exposed): `web` (Next.js Admin UI, TypeScript), `control-plane`
  (Fastify, TypeScript/Node — auth, membership, quota, tenant resolution).
- **Internal only** (ClusterIP, never Ingress-routed): `search-api` (Go, tenant-scoped
  Meilisearch proxy), `postgres` (users/orgs/memberships/usage), `redis`
  (rate-limit counters), `meilisearch` (per-tenant search indexes).

**Current deployment target: local k3d (Kubernetes-in-Docker).** The
Kubernetes runtime (`infra/k8s/base` + `infra/k8s/overlays/local`, Kustomize)
deploys this exact topology to a local k3d cluster and has been verified
end-to-end there (register → login → create-org → index → search through the
ingress, internal services unreachable via ingress, Postgres data survives a
pod restart). A `infra/k8s/overlays/gke` overlay also exists in the repo but
is **not deployed** — it is manifests-only, explicitly out of scope for this
submission, and would need real secret management (see §6) and an
Artifact-Registry image reference before it could be applied to a real GKE
cluster. A legacy `terraform/` + Cloud Run GitHub Actions workflow
(`deploy-gcp.yml`) also exists from an earlier iteration of this project and
is not the deployment path this threat model or the current topology
describes; it is called out as a residual risk in §7.

Locally, outside k8s, the same services also run via `docker-compose.yml`
for day-to-day development.

## 2. Assets

### Primary assets
- User credentials (bcrypt password hashes) and JWTs
- Organization membership, role (OWNER/ADMIN/MEMBER), and plan (FREE/PRO) data
- Per-tenant search indexes and documents (Meilisearch)
- Usage/quota data (`UsageEvent`) — search counts and rate-limit rejections
- Secrets: `JWT_SECRET` (control-plane), `JWT_SECRET_KEY` (legacy Go value),
  `MEILISEARCH_API_KEY`, Postgres credentials

### Secondary assets
- API availability (control-plane, search-api)
- Redis integrity (rate-limit correctness)
- Structured request logs (must never themselves become a place secrets leak to)

## 3. Trust boundary (the core design invariant)

External clients **never** choose the tenant identifier used by the Go
service. Every tenant-scoped request goes through one fixed pipeline in the
Fastify control plane:

```
authenticate user (JWT) -> resolve :slug -> organization UUID (Postgres)
-> verify membership -> authorize role (if required) -> apply Redis quota
-> inject X-Tenant-ID: <trusted UUID> -> call internal Go API
```

Verified in code and by test:
- `apps/control-plane/src/lib/membership.ts` (`resolveMembership`) is the
  **only** place a slug is turned into an organization UUID, and it always
  checks a `Membership` row exists for the caller first.
- `apps/control-plane/src/lib/searchClient.ts` always forwards the
  server-resolved `organization.id`, never anything read from the inbound
  request, as `X-Tenant-ID` to the Go service.
- Any inbound `X-Tenant-ID` header sent by an external client is never read
  by Fastify at all — it is simply never referenced when building the
  outbound request.
- The Go service (`internal/handlers/internal_search.go`,
  `requireTenantID`) rejects any call with a missing/empty `X-Tenant-ID`
  with `400`, and is only reachable from inside the cluster
  (`internal/**` is never Ingress-routed; enforced by the k8s manifests).
- `apps/control-plane/src/__tests__/search.test.ts` asserts this directly:
  an inbound `X-Tenant-ID: attacker-supplied-tenant-id` header is proven to
  be ignored and the trusted, server-resolved UUID is proven to reach the
  downstream client instead.

**Residual risk:** the Go service's own tenant/role context helpers
(`pkg/security/context.go`, `pkg/security/jwt.go`) and its own
`internal/handlers/auth.go` are legacy code from an earlier, single-service
iteration of this project. They are not part of the request path described
above (all end-user auth is now Fastify's) and must never be wired to a
publicly-reachable route — this is enforced today only by the Ingress
manifest not routing to `search-api`, not by removing the code. If a future
change accidentally exposes a Go route publicly, that legacy auth path would
bypass the control plane's membership/quota checks entirely.

## 4. Threats & mitigations

### 4.1 Authentication bypass
**Threat:** call a protected endpoint without a valid session, or use a
forged/expired token.

**Mitigations:**
- `requireAuth` (`apps/control-plane/src/lib/auth.ts`) runs `request.jwtVerify()`
  on every protected route and throws `401 UNAUTHENTICATED` on any failure
  (missing, malformed, or invalid-signature token).
- Passwords are hashed with bcrypt (cost 10 in the control plane, cost 12 in
  the legacy Go path) — never stored or compared in plaintext.
- **Fixed in this change:** issued JWTs previously had no expiry at all
  (`app.register(jwt, { secret })` with no `sign` options — tokens were
  valid forever once issued). `apps/control-plane/src/app.ts` now registers
  `sign: { expiresIn: config.jwtExpiresIn }` (default `24h`, configurable via
  `JWT_EXPIRES_IN`), so every token carries an `exp` claim and
  `request.jwtVerify()` rejects expired tokens with `401`. Covered by a new
  test (`auth.test.ts`: "rejects an expired JWT with 401").
- **Fixed in this change:** `server.ts` now refuses to start with the
  hardcoded fallback `JWT_SECRET` (`dev-secret-change-me`) when
  `NODE_ENV=production`, closing off a class of "forge any token" bugs from
  a misconfigured deploy. This does not change local/dev behavior (no
  `NODE_ENV` is set locally or in the k3d overlay's dev config).

### 4.2 Authorization errors & privilege escalation
**Threat:** a MEMBER performs an OWNER/ADMIN-only action; a non-member reads
another organization's data; a user reads/writes an organization they were
never invited to.

**Mitigations:**
- `resolveMembership` throws `403 UNAUTHORIZED` (not `404`) for a
  non-member on a real organization, and a real `404 NOT_FOUND` for an
  unknown slug — verified in `organizations.test.ts`.
- `requireRole` throws `403` (never `401`) when an authenticated member's
  role doesn't permit the action (`PATCH .../plan`, `POST .../documents/batch`
  are OWNER/ADMIN-only; `GET .../search` and `GET .../usage` are member-only).
  Verified in `organizations.test.ts` and `search.test.ts`.
- Every organization-scoped route resolves membership from the trusted
  `slug -> Organization -> Membership` chain in Postgres; there is no code
  path that trusts a client-supplied organization id or role.

### 4.3 Rate-limit bypass & resource abuse
**Threat:** exceed a plan's search quota, or cause cost/DoS via unbounded
request volume.

**Mitigations:**
- `checkAndIncrementRateLimit` (`apps/control-plane/src/lib/redis.ts`) is a
  fixed-window counter keyed `rate:{organizationId}:search:{epoch-minute}`,
  atomically incremented via `INCR`, i.e. quota is **organization-scoped**,
  not per-IP or per-user (matches `CONTRACT.md` §6 — a single abusive member
  affects their whole org's quota, not individual users, which is the
  intended shared-quota billing model).
- The key expires (`EXPIRE 120`) so it never grows unbounded in Redis.
- **Fails closed on Redis errors:** `redis.incr()` is not wrapped in a
  try/catch that defaults to "allow" — if Redis is unreachable, the promise
  rejects, propagates to Fastify's error handler, and the request fails
  with a generic `500` rather than silently bypassing the quota. This is
  intentionally the safer failure mode for a billing-relevant control, at
  the cost of availability during a Redis outage — an accepted trade-off for
  this project's scale, called out explicitly here rather than left as a
  silent assumption.
- Every `429` is recorded as a `UsageEvent` for auditability and surfaced via
  `GET /organizations/:slug/usage`. Verified end-to-end in `search.test.ts`
  ("returns 429 and records a rate-limited usage event...").

### 4.4 Injection & input handling
**Threat:** SQL injection, path manipulation, mass assignment.

**Mitigations:**
- All Postgres access goes through Prisma's generated client with typed,
  parameterized queries — no raw SQL string concatenation anywhere in
  `apps/control-plane/src`.
- Every request body is validated against a `zod` schema before use
  (`registerSchema`, `loginSchema`, `createOrgSchema`, `updatePlanSchema`,
  `batchDocumentSchema`); unrecognized/extra fields never reach Prisma calls
  because the parsed, typed `data` object — not `request.body` — is used.
- The internal Go endpoints use typed Gin bindings (`ShouldBindJSON`/
  `ShouldBindQuery`), not raw query construction.

### 4.5 Multi-tenant data leakage
**Threat:** Org A's request returns Org B's documents.

**Mitigations:** see §3 above (trust boundary). In addition:
- Meilisearch indexes are physically separated per tenant
  (`tenant_<normalized-org-uuid>_articles`,
  `internal/adapters/meilisearch.go`), not a shared index with a tenant
  filter — a query for tenant A's index structurally cannot return tenant
  B's documents even if a filter were misapplied.
- `search.test.ts` proves this at the HTTP boundary: a spoofed inbound
  `X-Tenant-ID` header never reaches the search client; only the
  server-resolved UUID does.

### 4.6 Secure error handling
**Threat:** stack traces, internal error text, or downstream implementation
details leak to an external client.

**Mitigations:**
- Every error response is `{ "error": { "code": "<STRING>", "message": "<human message>" } }`
  (`apps/control-plane/src/lib/errors.ts`, Go's `pkg/errors`), enforced by
  Fastify's global `setErrorHandler` in `app.ts`: any non-`ApiError`,
  non-validation error is converted to a generic `500 INTERNAL_ERROR` with a
  fixed message (`"An unexpected error occurred"`); the real error is only
  ever written to the server-side structured log (`request.log.error`), never
  the response body.
- On the Go side, `errors.Handle` always serializes `AppError.Message` (a
  fixed, code-author-chosen string) — never `AppError.Err.Error()` (the
  wrapped underlying driver/library error) — into the JSON response.
  `errors.Search("failed to search tenant documents", err)` and friends
  never put a raw Meilisearch/Postgres error string in front of a client.
- **Note (not fixed, low severity):** when the control plane's proxy to the
  Go service returns a `4xx/5xx`, `searchClient.ts` includes the (already
  sanitized, code-owned) Go response body text inside its own `ApiError`
  message, e.g. `Search API returned an error: {"error":{...}}`. This is a
  double-wrapped, slightly redundant message shape, but it does not leak
  secrets or stack traces, since the inner body is itself already sanitized
  per the point above. Left as-is to avoid changing the tested error-message
  contract for a cosmetic-only issue.

### 4.7 Secrets handling
**Threat:** a credential or signing key committed to source control, or
present in logs.

**Mitigations / findings:**
- Repo scan found no committed `.env` files, private keys, or credential
  literals — only `.env.example` (control-plane, web, and repo-root)
  templates with clearly-labeled placeholder/dev values
  (`dev-only-change-me`, etc.).
- Fastify's request logger (`logger: true`) logs method/URL/status/latency,
  not request bodies — passwords and tokens submitted in `POST /auth/*`
  bodies are never written to the control-plane's logs. The Go structured
  logger (`pkg/logging/middleware.go`) logs `request_id`, HTTP metadata,
  `user_id`, `tenant_id`, and error message only — never a password or a raw
  JWT. Grepped for `password`/`token` field usage in both logging packages
  to confirm.
- **Known limitation:** Kubernetes `Secret` objects (`infra/k8s/base/secret.yaml`)
  hold `JWT_SECRET`, `JWT_SECRET_KEY`, DB credentials, and the Meilisearch
  key as base64-encoded (not encrypted-at-rest by default) values — this is
  a plain k8s Secret, not a managed secret store (Vault, GCP Secret Manager,
  etc.). Acceptable for a local k3d prototype; the repo's own
  `infra/k8s/overlays/gke/kustomization.yaml` explicitly documents that a
  real GKE deployment must move to Secret Manager via the CSI driver before
  going anywhere near production data, and intentionally does not patch the
  base secret so it can't be applied as-is by accident.
- **Fixed in this change:** `server.ts` now refuses to boot with the
  hardcoded default `JWT_SECRET` value when `NODE_ENV=production` (see
  §4.1) — a defense specifically against this class of "checked-in dev
  secret reaches a real environment" mistake.

### 4.8 Dependency / vulnerability scanning
- The Go module already runs `govulncheck ./...` in
  `.github/workflows/build-and-test.yml` on every push/PR to `main`.
- **Added in this change:** an informational (non-blocking) `npm audit`
  step in `.github/workflows/control-plane-ci.yml`. It intentionally does
  not fail the build — several current advisories are in transitive dev/
  build-only dependencies (`vite`/`vitest`'s `esbuild`, `@mapbox/node-pre-gyp`'s
  `tar`, both install/dev-time only) that would require breaking upgrades to
  clear. One is worth calling out explicitly rather than leaving buried in
  CI output: `fast-jwt` (a transitive dependency of `@fastify/jwt@8.x`, the
  version currently pinned) has a critical advisory for an HMAC
  empty-secret auth-bypass. This project always supplies a non-empty
  `JWT_SECRET` (enforced for production by the new boot-time guard in
  §4.1), so the specific bypass condition does not apply as configured
  today — but upgrading to `@fastify/jwt@10.x` (a breaking change,
  intentionally not done in this change to keep the diff minimal and
  reviewable) should be tracked as follow-up work.

## 5. Rate limiting details
See `CONTRACT.md` §6: `FREE=30/min`, `PRO=300/min` by default, Redis key
`rate:{organizationId}:search:{window}`, organization-scoped (not IP-scoped
— a design choice, not a gap: this is a per-tenant billing quota, and
IP-scoping it would let a multi-user org trivially multiply its own quota by
using multiple client IPs).

## 6. Negative-path test coverage
All of the following are exercised as automated tests today
(`apps/control-plane/src/__tests__/`):

| Scenario | Test | Expected |
|---|---|---|
| No JWT on a protected route | `auth.test.ts`, `organizations.test.ts` | `401 UNAUTHENTICATED` |
| Expired JWT | `auth.test.ts` ("rejects an expired JWT with 401") — **added in this change** | `401 UNAUTHENTICATED` |
| Non-member accesses an org route | `organizations.test.ts` | `403 UNAUTHORIZED` |
| MEMBER attempts an OWNER/ADMIN action | `organizations.test.ts`, `search.test.ts` | `403 UNAUTHORIZED` |
| Quota exhausted | `search.test.ts` | `429 RATE_LIMITED`, usage event recorded |
| Spoofed inbound `X-Tenant-ID` | `search.test.ts` (search + documents/batch) | trusted server-resolved UUID reaches the downstream client, not the spoofed value |
| Unknown organization slug | `organizations.test.ts` | `404 NOT_FOUND` |
| Downstream search API unavailable | `search.test.ts` | `503 SERVICE_UNAVAILABLE`, no internal detail leaked |

## 7. Residual risks & known limitations (honest accounting)

- **Single-replica Postgres.** `infra/k8s/base/postgres.yaml` runs a
  1-replica `StatefulSet` with a single PVC — a deliberate prototype
  trade-off (no HA, no automated backups, no read replica). A pod
  restart preserves data (verified), but node loss or PVC loss is data
  loss. Acceptable for this submission's scope; would need a managed
  Postgres (Cloud SQL, RDS) or a proper HA operator before any real
  multi-user deployment.
- **Kubernetes Secrets, not a managed secret store**, as described in §4.7.
- **GKE overlay is unexercised.** `infra/k8s/overlays/gke` exists but has
  never been applied to a real cluster; treat it as a starting point, not a
  validated deployment path.
- **Legacy Cloud Run / Terraform path.** `terraform/` and
  `.github/workflows/deploy-gcp.yml` are artifacts of an earlier,
  single-Go-service iteration of this project. Notably,
  `deploy-gcp.yml` deploys with `--allow-unauthenticated`, which would be
  actively wrong for the current architecture if it deployed the Go
  search-api directly (that service must never be public — see
  `CONTRACT.md` §1/§4). It relies on `secrets.GCP_SA_KEY`/`GCP_PROJECT_ID`
  which are not configured for this repo, so it does not currently deploy
  anything; it is flagged here rather than silently left as dead-looking
  but latent-dangerous CI config. Recommendation: disable or delete this
  workflow once the k3d/Kustomize path is the agreed deployment story, to
  remove the risk of someone re-enabling it by supplying the missing
  secrets.
- **No WAF / service mesh / external IdP**, by design — out of scope for
  this project's size and threat profile (see also §8).
- **Redis rate limiting fails closed but not gracefully.** A Redis outage
  turns into `500`s for every search request rather than a degraded-but-
  available mode. Acceptable trade-off given the alternative (fail open)
  would let a Redis outage become a way to bypass billing-relevant quotas.
- **`fast-jwt` critical advisory**, discussed in §4.8 — not currently
  exploitable given this project's configuration, but should be resolved by
  a tracked `@fastify/jwt` major-version upgrade.

## 8. Explicitly out of scope (by design, not oversight)
- External identity provider / SSO / social login.
- Web application firewall.
- Service mesh / mTLS between internal services.
- Automated secret rotation.
- Multi-region / multi-AZ deployment.

These are reasonable asks for a platform at a much larger scale or handling
more sensitive data; introducing them here would add operational complexity
disproportionate to this project's actual threat profile (a prototype
multi-tenant search SaaS, not a payments or health-data system).
