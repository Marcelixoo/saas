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
Response `202`: `{ "accepted": 1 }`

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
| POST   | `/internal/documents/batch` | `X-Tenant-ID: <org-uuid>` | index into that tenant's index |

- `/internal/search` returns `{ query, hits, total }` and, when `facets` are
  requested, a `facetDistribution` map; `limit`/`offset` echo effective paging.
- `/internal/documents` returns `{ documents, total, offset, limit }`. The lister
  lives on a separate `TenantDocumentLister` interface (`internal/search/documents.go`)
  so the Catalog agent's files don't overlap the search-tenancy files.
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

The app is a **single page** (`/`) with a header (org switcher + plan badge +
logout) and a `Tabs` control (Metrics · Search · Catalog · Settings). Existing
testids keep the same meaning; actions simply live under their tab now, so tests
click the tab first.

```
# auth (login screen)
signup-email        signup-password     signup-submit       signup-name
login-email         login-password      login-submit
# header (always visible when authenticated)
organization-create organization-name   organization-submit
organization-select plan-badge
# tabs
tab-metrics         tab-search          tab-catalog         tab-settings
# Metrics tab
usage-search-count  usage-rate-limit-count
# Search tab
search-input        search-submit       search-results      search-hit    search-hit-price
# Catalog tab
seed-catalog        catalog-seed-info
# Settings tab
plan-select
```

`search-results` container renders one child (`search-hit`) per hit; each hit
exposes its title as text so Playwright can assert presence/absence, and its
price via `search-hit-price`.

**Reserved for page-agents** (add when built, do not rename): `metrics-chart`,
`search-facet-<field>`, `search-sort`, `catalog-table`, `catalog-row`,
`members-table`, `member-invite-email`, `member-invite-role`, `member-invite-submit`,
`member-remove`, `org-rename-input`, `org-rename-submit`.

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

### UI rebrand page-agents (feat/ui-rebrand)

The rebrand is split by page. The **foundation** (main agent) owns the shell and
shared wiring; each **page-agent** owns exactly the files below (frontend tab +
its hooks + its backend), which are file-disjoint so they build in parallel.

| Agent | Frontend (owns) | Backend (owns) |
|-------|-----------------|----------------|
| Foundation | `app/page.tsx`, `app/components/{AuthPanel,AppHeader,Dashboard}.tsx`, `app/components/tabs/*` (basic), `lib/api.ts` (client surface), `lib/hooks/{useOrganizations,useActiveOrg,useUsage,mutations}.*`, `tests/e2e/*` | `app.ts` wiring, route stubs `routes/{metrics,documents,members}.ts`, Go `main.go` route + `internal/{search/documents.go,adapters/meilisearch_documents.go,handlers/internal_documents.go}` stubs |
| A — Metrics | `app/components/tabs/MetricsTab.tsx`, `lib/hooks/useUsageTimeseries.ts` | `apps/control-plane/src/routes/metrics.ts` (+ test) |
| B — Search | `app/components/tabs/SearchTab.tsx`, `lib/hooks/useSearch.ts` | `routes/organizations.ts` (search route only), `lib/searchClient.ts`; Go `internal/adapters/meilisearch.go`, `internal/search/engine.go`, `internal/handlers/internal_search.go` (+ tests) |
| C — Catalog | `app/components/tabs/CatalogTab.tsx`, `lib/hooks/useCatalog.ts` | `routes/documents.ts` (+ test); Go `internal/search/documents.go`, `internal/adapters/meilisearch_documents.go`, `internal/handlers/internal_documents.go` |
| D — Settings | `app/components/tabs/SettingsTab.tsx`, `lib/hooks/{useMembers,useUpdateOrganization}.ts` | `routes/members.ts` (members CRUD + `PATCH /organizations/:slug`) (+ test) |

Shared files edited once by Foundation (`app.ts`, `cmd/server/main.go`,
`apps/web/package.json`, `apps/web/lib/api.ts`) are frozen for page-agents —
consume them, do not re-edit. `lib/api.ts` already exports every client function
the pages need.

## 10. Web data-hook layer (SWR)

Every API transaction goes through a hook in `apps/web/lib/hooks/` — components
never call `fetch`/`lib/api` functions for queries directly. Queries use `useSWR`,
mutations use `useSWRMutation`; SWR keys are the raw control-plane paths
(e.g. `/organizations`, `/organizations/:slug/usage`) so a mutation invalidates
by path with `mutate(...)`. Frozen hook surface:

```
useOrganizations()            -> { organizations, isLoading, error, mutate }
useActiveOrg()                -> { organizations, selectedSlug, selectedOrg, setSelectedSlug, ... }
useUsage(slug)                -> { usage, isLoading, error, mutate }
useUsageTimeseries(slug,days) -> { points, isLoading, error }              # Agent A
useSearch(slug)               -> { results, run(params), isSearching, error } # Agent B
useCatalog(slug,{offset,limit})-> { documents, total, isLoading, error }   # Agent C
useMembers(slug)              -> { members, isLoading, error, mutate }      # Agent D
# mutations (return { trigger, isMutating, error }):
useCreateOrganization()  useUpdatePlan(slug)  useSeedCatalog(slug)
useUpdateOrganization(slug)   # Agent D            useInviteMember(slug) / useRemoveMember(slug)  # Agent D
```

The bearer token is read from `localStorage` by the shared `swrFetcher`; a global
`SWRConfig.onError` in `page.tsx` logs the user out on `401`. Conditional fetching:
pass a falsy slug to disable a query.

## 11. React performance rules (must follow)

Per the React Best Practices guide, all rebrand code must: derive state during
render (never mirror props/other state into `useState`+`useEffect`); define no
component inside another component; use functional `setState` updates; use
`useDeferredValue`/`useTransition` for the search input; render conditionals with
explicit ternaries (never `cond && node` on a number/`0`); use `toSorted`/`Set`/`Map`
instead of mutating sorts and array scans; hoist regexes to module scope; lazily
initialize expensive `useState`; keep effect dependency arrays narrow; and put
side-effects in event handlers, not effects. SWR provides request dedup/caching;
do not hand-roll fetch caches.
