# Frozen Platform Contract

> This file is the **single source of truth** for cross-team interfaces. It is
> frozen before parallel implementation begins. Any change requires orchestrator
> sign-off, because multiple independent PRs depend on these shapes.

## 1. Component topology

```
Browser / Load Generator
          |
   Ingress / Gateway
      |         |
   Next.js    Fastify  (both PUBLIC)
   Admin UI   Control Plane
                 |
        +--------+---------+
        |        |         |
   PostgreSQL   Redis    Go Search API   (all INTERNAL / ClusterIP)
                            |
                       Meilisearch       (INTERNAL)
```

- **Public** (Ingress): `web` (Next.js), `control-plane` (Fastify).
- **Internal only**: `search-api` (Go), `postgres`, `redis`, `meilisearch`.
- The Go search service is **never** exposed publicly.

## 2. Trust boundary (non-negotiable)

External clients **never** choose the tenant identifier used by the Go service.

Fastify pipeline for every tenant-scoped request:

```
authenticate user -> resolve slug -> organization UUID -> verify membership
-> authorize -> load plan -> apply Redis quota -> inject X-Tenant-ID (trusted UUID)
-> call internal Go API
```

Any incoming external `X-Tenant-ID` header is **ignored / overwritten** by Fastify.

## 3. Public Fastify HTTP contract

Base URL (local): `http://localhost:8080`. All request/response bodies are JSON.

| Method | Path                                    | Auth        | Notes |
|--------|-----------------------------------------|-------------|-------|
| POST   | `/auth/register`                        | none        | email must be in `ALLOWED_SIGNUP_EMAILS` |
| POST   | `/auth/login`                           | none        | returns JWT |
| GET    | `/me`                                   | Bearer      | current user |
| GET    | `/organizations`                        | Bearer      | orgs the user belongs to |
| POST   | `/organizations`                        | Bearer      | creator becomes OWNER, plan defaults to FREE |
| PATCH  | `/organizations/:slug/plan`             | OWNER/ADMIN | body `{ "plan": "FREE" \| "PRO" }` |
| GET    | `/organizations/:slug/usage`            | member      | totals: search count + rate-limit rejections |
| GET    | `/organizations/:slug/search?q=...`     | member      | rate limited; proxied to Go w/ trusted X-Tenant-ID |
| POST   | `/organizations/:slug/documents/batch`  | OWNER/ADMIN | tenant injected; proxied to Go |

### Request/response shapes

`POST /auth/register` — request:
```json
{ "email": "user@example.com", "password": "secret12", "name": "User Name" }
```
Response `201`: `{ "user": { "id", "email", "name" }, "token": "<jwt>" }`

`POST /auth/login` — request `{ "email", "password" }`;
Response `200`: `{ "user": { "id", "email", "name" }, "token": "<jwt>" }`

`GET /me` — `200`: `{ "id", "email", "name" }`

`POST /organizations` — request `{ "name": "Acme Shop" }`;
Response `201`: `{ "id", "name", "slug", "plan": "FREE", "role": "OWNER" }`

`GET /organizations` — `200`: `[{ "id", "name", "slug", "plan", "role" }]`

`PATCH /organizations/:slug/plan` — request `{ "plan": "PRO" }`;
Response `200`: `{ "id", "name", "slug", "plan": "PRO" }`

`GET /organizations/:slug/usage` — `200`:
```json
{ "organizationId": "<uuid>", "searchCount": 12, "rateLimitedCount": 3, "indexCount": 1 }
```

`GET /organizations/:slug/search?q=nike` — `200`:
```json
{ "query": "nike", "hits": [ { "id": "...", "title": "Red Nike Shoe" } ], "total": 1 }
```

`POST /organizations/:slug/documents/batch` — request:
```json
{ "documents": [ { "id": "sku-1", "title": "Red Nike Shoe", "brand": "Nike", "category": "shoes" } ] }
```
Response `202`: `{ "accepted": 1 }`

### Standard error codes
`400` validation · `401` unauthenticated · `403` unauthorized · `404` missing ·
`429` quota exhausted · `502/503` downstream unavailable.

Error body shape: `{ "error": { "code": "<string>", "message": "<human readable>" } }`

## 4. Internal Go search API (called ONLY by Fastify)

Base URL (internal): `http://search-api:8081`. Tenant supplied via header.

| Method | Path                | Required header | Behavior |
|--------|---------------------|-----------------|----------|
| GET    | `/internal/search?q=...` | `X-Tenant-ID: <org-uuid>` | search that tenant's index |
| POST   | `/internal/documents/batch` | `X-Tenant-ID: <org-uuid>` | index into that tenant's index |

- Missing/empty `X-Tenant-ID` -> `400`.
- Index naming: `tenant_<normalized-org-uuid>_articles` (UUID lowercased, `-` -> `_`).
- Index config (searchable/filterable/sortable) is lazily initialized per tenant.
- Existing public Go routes may remain during migration but MUST NOT be exposed
  through Ingress in k8s.

## 5. Data model (PostgreSQL, owned by control-plane / Prisma)

```
User(id, email UNIQUE, passwordHash, name, createdAt)
Organization(id UUID, name, slug UNIQUE, plan FREE|PRO, createdAt)
Membership(id, userId, organizationId, role OWNER|ADMIN|MEMBER)
UsageEvent(id, organizationId, userId?, operation SEARCH|INDEX, statusCode, createdAt)
```

## 6. Rate limits

Defaults: `FREE = 30/min`, `PRO = 300/min`. Configurable via env:
`FREE_SEARCH_LIMIT`, `PRO_SEARCH_LIMIT`. Acceptance runs use small values
(e.g. FREE=3, PRO=10). Redis key: `rate:{organizationId}:search:{window}`.
Quota scope is **organization**, not source IP.

## 7. Frozen `data-testid` attributes (Admin UI, owned by web)

Playwright couples to these — never to CSS classes.

```
signup-email        signup-password     signup-submit
login-email         login-password      login-submit
organization-create organization-name   organization-submit
organization-select
plan-badge          plan-select
seed-catalog
search-input        search-submit       search-results
usage-search-count  usage-rate-limit-count
```

`search-results` container renders one child per hit; each hit exposes its title
as text so Playwright can assert presence/absence.

## 8. Acceptance environment variables

```
E2E_BASE_URL   (Admin UI base, default http://localhost:3000)
E2E_API_URL    (Fastify base, default http://localhost:8080)
E2E_EMAIL      (allow-listed signup email for the run)
E2E_PASSWORD
```

Tests generate unique org names/slugs per run (timestamp/UUID suffix). No cleanup
endpoints required.

## 9. Ownership boundaries (do not cross without orchestrator sign-off)

| Area                         | Owner            | Paths |
|------------------------------|------------------|-------|
| Acceptance suite             | Orchestrator     | `tests/e2e/**`, `playwright.config.*`, `.github/workflows/acceptance-e2e.yml` |
| Control plane                | Agent A          | `apps/control-plane/**` |
| Go search tenancy            | Agent B          | `cmd/**`, `internal/**`, `config/**`, `pkg/**` (search-only) |
| Local dev platform           | Agent C          | `docker-compose.yml`, local Dockerfiles, `.env.example` |
| Admin UI                     | Agent D          | `apps/web/**` |
| Kubernetes runtime           | Agent E          | `infra/**` |
| Load generator               | Agent F          | `load/**`, `docs/load-test-results.md` |
| Security/observability       | Agent G          | focused middleware/config/CI, `THREAT_MODEL_ANALYSIS.md` |
| Submission docs              | Agent H          | `README.md`, `ARCHITECTURE.md`, `docs/**` |
