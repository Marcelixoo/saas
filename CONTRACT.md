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
| POST   | `/auth/register`                        | none        | email must match `ALLOWED_SIGNUP_EMAILS` (see note) |
| POST   | `/auth/login`                           | none        | returns JWT |
| GET    | `/me`                                   | Bearer      | current user |
| GET    | `/organizations`                        | Bearer      | orgs the user belongs to |
| POST   | `/organizations`                        | Bearer      | creator becomes OWNER, plan defaults to FREE |
| PATCH  | `/organizations/:slug/plan`             | OWNER/ADMIN | body `{ "plan": "FREE" \| "PRO" }` |
| PATCH  | `/organizations/:slug`                  | OWNER/ADMIN | rename org; body `{ "name": "New Name" }` (Agent D) |
| GET    | `/organizations/:slug/usage`            | member      | totals: search count + rate-limit rejections |
| GET    | `/organizations/:slug/usage/timeseries` | member      | per-day counts, last `days` days (Agent A) |
| GET    | `/organizations/:slug/search?q=...`     | member      | rate limited; proxied to Go w/ trusted X-Tenant-ID (Agent B) |
| GET    | `/organizations/:slug/documents`        | member      | paginated listing of indexed docs (Agent C) |
| POST   | `/organizations/:slug/documents/batch`  | OWNER/ADMIN | tenant injected; proxied to Go |
| GET    | `/organizations/:slug/members`          | member      | list org members (Agent D) |
| POST   | `/organizations/:slug/members`          | OWNER/ADMIN | invite member by email (Agent D) |
| DELETE | `/organizations/:slug/members/:userId`  | OWNER/ADMIN | remove member (Agent D) |

### Request/response shapes

`POST /auth/register` — request:
```json
{ "email": "user@example.com", "password": "secret12", "name": "User Name" }
```
Response `201`: `{ "user": { "id", "email", "name" }, "token": "<jwt>" }`

**Allowlist matching (`ALLOWED_SIGNUP_EMAILS`)** — comma-separated list whose entries
are either a full email (`alice@corp.com`) **or** a domain prefixed with `@`
(`@e2e.test`, matches any local-part at that domain). This lets the acceptance suite
generate a unique, still-allow-listed email per run via plus-addressing
(`assessor+<runid>@e2e.test`) and avoids "email already registered" flakiness once
data persists. Matching is case-insensitive.

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
Response `202`: `{ "accepted": 1 }`. Optional query `?reset=true` truncates the
tenant index before indexing this batch (a clean rebuild, preserving index
settings), so a re-seed doesn't accumulate stale/duplicate documents. The web
`seedCatalog` sets `reset=true` on the first chunk only.

`PATCH /organizations/:slug` (Agent D) — request `{ "name": "New Name" }`;
Response `200`: `{ "id", "name", "slug", "plan" }` (slug is stable; only the name changes).

`GET /organizations/:slug/usage/timeseries?days=14` (Agent A) — `days` defaults to
14, clamp to a sane max (e.g. 90). Response `200`:
```json
{ "organizationId": "<uuid>", "days": 14,
  "points": [ { "date": "2026-08-18", "search": 5, "index": 2, "rateLimited": 1 } ] }
```
`points` is ascending by `date` (UTC `YYYY-MM-DD`) and dense — every day in the
window is present, zero-filled. `search` counts successful searches (`statusCode < 400`),
`rateLimited` counts `429`s, `index` counts successful INDEX ops.

`GET /organizations/:slug/usage/timeseries?window=1h|3h|24h|7d` — fine-grained mode for
short time ranges (line-chart friendly). Mutually exclusive with `days`/`?window=` takes
priority when both are present. Bucket resolution per window: `1h` → 12 × 5-minute
buckets, `3h` → 12 × 15-minute buckets, `24h` → 24 × 1-hour buckets, `7d` → 7 × 1-day
buckets. Response `200`:
```json
{ "organizationId": "<uuid>", "window": "1h",
  "points": [ { "ts": "2026-08-18T21:05:00.000Z", "search": 3, "index": 0, "rateLimited": 0 } ] }
```
`points` is ascending by `ts` (ISO 8601, bucket start) and dense — every bucket in the
window is present, zero-filled. Same `search`/`index`/`rateLimited` counting rules as the
`days` mode. An invalid `window` value is `400`.

`GET /organizations/:slug/search` (Agent B) — accepts `q` (required) plus optional
`filter` (Meilisearch filter expression), `sort` (comma-separated, e.g. `price:asc`),
`limit`, `offset`, and `facets` (comma-separated fields). Response `200`:
```json
{ "query": "nike", "hits": [ { "id": "...", "title": "Red Nike Shoe", "price": 59.9 } ],
  "total": 1, "limit": 20, "offset": 0,
  "facetDistribution": { "category": { "shoes": 1 } } }
```
`facetDistribution` is present only when `facets` were requested. `limit`/`offset`
echo the effective pagination. Backward compatible: a bare `?q=` still returns
`{ query, hits, total }`.

`GET /organizations/:slug/documents?offset=0&limit=20` (Agent C) — Response `200`:
```json
{ "documents": [ { "id": "sku-1", "title": "Red Nike Shoe", "price": 59.9, "imageUrl": "https://..." } ],
  "total": 500, "offset": 0, "limit": 20 }
```

`GET /organizations/:slug/members` (Agent D) — Response `200`:
```json
{ "members": [ { "userId": "<uuid>", "email": "a@e2e.test", "name": "Ada", "role": "OWNER" } ] }
```

`POST /organizations/:slug/members` (Agent D) — request `{ "email": "b@e2e.test", "role": "MEMBER" }`;
Response `201`: `{ "member": { "userId", "email", "name", "role" } }`. The invited email
MUST already belong to a registered user (creates a `Membership`; does not create users).
`role` is `ADMIN` or `MEMBER` — inviters cannot grant `OWNER`, and no action may escalate
the caller's own role. `409` if already a member.

`DELETE /organizations/:slug/members/:userId` (Agent D) — Response `204`. Removing the
last `OWNER` is rejected with `400`/`409`.

### Standard error codes
`400` validation · `401` unauthenticated · `403` unauthorized · `404` missing ·
`429` quota exhausted · `502/503` downstream unavailable.

Error body shape: `{ "error": { "code": "<string>", "message": "<human readable>" } }`

## 4. Internal Go search API (called ONLY by Fastify)

Base URL (internal): `http://search-api:8081`. Tenant supplied via header.

| Method | Path                | Required header | Behavior |
|--------|---------------------|-----------------|----------|
| GET    | `/internal/search?q=...` | `X-Tenant-ID: <org-uuid>` | search that tenant's index; accepts `filter`, `sort`, `limit`, `offset`, `facets` (Agent B) |
| GET    | `/internal/documents?offset=&limit=` | `X-Tenant-ID: <org-uuid>` | paginated listing of that tenant's docs (Agent C) |
| POST   | `/internal/documents/batch` | `X-Tenant-ID: <org-uuid>` | index into that tenant's index; `?reset=true` truncates first |

- `/internal/search` returns `{ query, hits, total }` and, when `facets` are
  requested, a `facetDistribution` map; `limit`/`offset` echo effective paging.
- `/internal/documents` returns `{ documents, total, offset, limit }`. The lister
  lives on a separate `TenantDocumentLister` interface (`internal/search/documents.go`)
  so the Catalog agent's files don't overlap the search-tenancy files.
- Missing/empty `X-Tenant-ID` -> `400`.
- Index naming: `tenant_<normalized-org-uuid>_articles` (UUID lowercased, `-` -> `_`).
- Index config (searchable/filterable/sortable) is lazily initialized per tenant.
  Ranking rules put `sort` first (`sort, words, typo, proximity, attribute,
  exactness`) so an explicit `sort` orders results globally rather than only as a
  relevancy tie-breaker; unsorted queries are unaffected. `price` is filterable +
  sortable.
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

The app is a **single page** (`/`) laid out as a **sidebar console**: a left
sidebar (brand, org picker + create affordance, section nav, user footer), a
topbar (breadcrumb, operational status, plan indicator, seed action), and a
content area that swaps sections. Nav is client-side section switching (no
routing). Existing action testids keep the same meaning; navigation moved from
`tab-*` triggers to `nav-*` sidebar entries, so tests click the sidebar entry
first.

```
# auth (login screen)
signup-email        signup-password     signup-submit       signup-name
login-email         login-password      login-submit
# sidebar org picker (always visible when authenticated)
organization-create organization-name   organization-submit
organization-select
# sidebar nav (client-side section switch)
nav-metrics   nav-search   nav-catalog   nav-members   nav-upgrade   nav-settings
# topbar (always visible)
plan-badge          seed-catalog        refresh-data
# Metrics section
usage-search-count  usage-rate-limit-count   usage-index-count   metrics-chart
metrics-range-toggle
# Search section
search-input   search-submit   search-results   search-hit   search-hit-price
search-hit-score   search-sort    search-facet-<field>
# Catalog section
catalog-seed-info   catalog-table   catalog-row   catalog-prev-page   catalog-next-page
# Members section
members-table   member-invite-email   member-invite-role   member-invite-submit   member-remove
# Settings section
plan-select    org-rename-input    org-rename-submit
```

`seed-catalog` lives in the topbar (available from any section); its result
surfaces as `catalog-seed-info` in the Catalog data section. `plan-badge` is the
plan chip inside the topbar Plan button (opens Settings).

`search-results` container renders one child (`search-hit`) per hit; each hit
exposes its title as text so Playwright can assert presence/absence, and its
price via `search-hit-price`.

`usage-index-count` ("Documents indexed") is the LIVE catalog document total
(same source as `/organizations/:slug/documents`'s `total`, i.e. `useCatalog`),
never `usage.indexCount` (a count of successful INDEX *operations*, e.g. seed
batches — a single seed request can index hundreds of documents in one
operation, so the two numbers are not interchangeable). `metrics-range-toggle`
selects the usage-timeseries window (`1h`/`3h`/`24h`/`7d`) driving the
`metrics-chart` line chart (see §3's `?window=` mode).

## 8. Acceptance environment variables

```
E2E_BASE_URL   (Admin UI base, default http://localhost:3000)
E2E_API_URL    (Fastify base, default http://localhost:8080)
E2E_EMAIL      (allow-listed signup email for the run)
E2E_PASSWORD
```

Tests generate unique org names/slugs per run (timestamp/UUID suffix). No cleanup
endpoints required.

---

> Sections above are the frozen cross-component contract. Build-process
> coordination that used to live here (per-agent ownership boundaries, the
> `feat/ui-rebrand` page split, the web SWR hook surface, and React coding
> rules) has been retired now that the rebrand has shipped — the Admin UI's hook
> layer is documented in code under `apps/web/lib/hooks/`, and the development
> workflow is summarized in the [documentation hub](docs/README.md).
