# Submission runbook

A single place for an assessor to bring the platform up, run the tests, and
verify the behavior described in [`CONTRACT.md`](../CONTRACT.md) and
[`ARCHITECTURE.md`](../ARCHITECTURE.md). Nothing here is aspirational — every
command is one that exists in this repository today; anything not fully
implemented is called out explicitly under [Known limitations](#known-limitations).

## Contents

- [Local development (Docker Compose)](#local-development-docker-compose)
- [Local Kubernetes (k3d)](#local-kubernetes-k3d)
- [GKE (not deployed)](#gke-not-deployed)
- [PostgreSQL: single-replica trade-off & backup](#postgresql-single-replica-trade-off--backup)
- [CI/CD](#cicd)
- [Playwright acceptance suite](#playwright-acceptance-suite)
- [Load generator](#load-generator)
- [Test commands quick reference](#test-commands-quick-reference)
- [Assessor accounts / configuration](#assessor-accounts--configuration)
- [Security controls (summary)](#security-controls-summary)
- [Known limitations](#known-limitations)
- [Five-minute demo](#five-minute-demo)

## Local development (Docker Compose)

```bash
cp .env.example .env
docker compose --profile full up --build
```

Services and ports (see `docker-compose.yml` and `.env.example` for the full
variable list):

| Service | Host port | Exposure |
|---|---|---|
| `web` | `3000` | public |
| `control-plane` | `8080` | public |
| `postgres` | `5432` | published for local debugging; internal-only in k8s |
| `redis` | `6379` | published for local debugging; internal-only in k8s |
| `meilisearch` | `7700` | published for local debugging; internal-only in k8s |
| `search-api` | *(none)* | internal only, even locally — reachable as `http://search-api:8081` from other containers |

`docker compose up --build` (no profile) starts only `postgres`, `redis`,
`meilisearch`, `search-api` — useful for iterating on the Go service without
rebuilding the Node apps.

Key env vars (`.env.example`, root): `POSTGRES_*`, `DATABASE_URL`,
`REDIS_URL`, `MEILISEARCH_HOST` / `MEILISEARCH_API_KEY` (one value shared by
both the Meilisearch server's master key and the Go client, so they can
never drift), `JWT_SECRET` (control-plane) / `JWT_SECRET_KEY` (legacy Go
config), `ALLOWED_SIGNUP_EMAILS`, `FREE_SEARCH_LIMIT` / `PRO_SEARCH_LIMIT`,
`NEXT_PUBLIC_API_URL`.

## Local Kubernetes (k3d)

This is the actual acceptance target for the submission (per the task
brief). The manifests live under `infra/k8s/**` and were finalized on the
`infra/k8s-runtime` branch, merged for this submission;
[`infra/README.md`](../infra/README.md) is the authoritative source for this
component and should be consulted for anything not covered here.

```bash
# 1. Cluster with the Traefik loadbalancer mapped to a free host port.
k3d cluster create saas --port "8088:80@loadbalancer" --agents 1 --wait

# 2. Build images (custom Dockerfiles under infra/docker/ — see infra/README.md
#    for why they differ slightly from the app-owned Dockerfiles, e.g.
#    web needs NEXT_PUBLIC_API_URL baked in at build time for the browser).
docker build -f infra/docker/search-api.Dockerfile -t saas/search-api:local .
docker build -f infra/docker/control-plane.Dockerfile -t saas/control-plane:local .
docker build -f infra/docker/web.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://api.localtest.me:8088 \
  -t saas/web:local .

# 3. Import into the cluster's containerd (no registry needed).
k3d image import saas/search-api:local saas/control-plane:local saas/web:local -c saas

# 4. Deploy the local overlay.
kubectl apply -k infra/k8s/overlays/local

# 5. Watch rollout.
kubectl -n saas get pods -w
```

Expected `kubectl -n saas get pods` evidence: one running pod each for
`web`, `control-plane`, `search-api`, `redis`, plus one `Running` pod each
for the `postgres-0` and `meilisearch-0` StatefulSet members (each backed by
its own PVC — check with `kubectl -n saas get pvc`).

Host-reachable URLs (no `/etc/hosts` edits needed — `*.localtest.me`
resolves publicly to `127.0.0.1`):

- Admin UI: `http://web.localtest.me:8088`
- Control-plane API: `http://api.localtest.me:8088`

Point the Playwright suite or the load generator at these directly:

```bash
E2E_BASE_URL=http://web.localtest.me:8088
E2E_API_URL=http://api.localtest.me:8088
```

The local overlay (`infra/k8s/overlays/local/configmap-patch.yaml`) tunes
`FREE_SEARCH_LIMIT=3`, `PRO_SEARCH_LIMIT=10` so the quota acceptance test
doesn't need to hammer the API for a full minute at production limits, and
sets `ALLOWED_SIGNUP_EMAILS=@e2e.test`.

Secrets (`infra/k8s/overlays/local/secret-patch.yaml`) are plain Kubernetes
`Secret`s with placeholder dev values (`*-change-me`) — acceptable for a
local submission, not to be reused anywhere real.

**search-api and postgres/redis/meilisearch are never referenced by the
Ingress** (`infra/k8s/base/ingress.yaml`) — only `web` and `control-plane`
have routes, matching `CONTRACT.md` §1/§9 exactly.

## GKE (not deployed)

`infra/k8s/overlays/gke/**` exists as manifests only:

- an Ingress patch targeting a GKE-style (`gce`) Ingress class,
- commented-out notes on pointing `images:` at an Artifact Registry repo and
  swapping plain k8s Secrets for GCP Secret Manager via the CSI driver.

**This overlay has not been applied to any real GKE cluster** as part of
this submission. Do not read its presence as a claim of a live cloud
deployment — the k3d bring-up above is the only deployment target that has
actually been exercised end to end.

## PostgreSQL: single-replica trade-off & backup

`infra/k8s/base/postgres.yaml` runs Postgres as a single-replica
`StatefulSet` with a 1Gi `PersistentVolumeClaim`. This is an intentional
prototype trade-off, not an oversight: a single replica has no automatic
failover, and losing the node it's scheduled on means downtime until
Kubernetes reschedules the pod (the PVC itself survives pod restarts —
verified by deleting `postgres-0` and confirming prior data is intact).

In a production deployment this would be replaced with a managed or HA
Postgres offering (e.g. Cloud SQL with HA, or a Postgres operator running a
primary + replicas with automated failover) plus a scheduled backup/restore
pipeline. For this submission, backups are manual:

```bash
kubectl -n saas exec postgres-0 -- pg_dump -U saas saas > backup-$(date +%F).sql
```

A CronJob that uploads this to object storage on a schedule is not
implemented (it's optional per the task brief).

## CI/CD

| Workflow | Scope | Blocking |
|---|---|---|
| `.github/workflows/build-and-test.yml` | Go build, `go test -race`, `govulncheck` | Yes |
| `.github/workflows/control-plane-ci.yml` | `apps/control-plane/**`: type-check, build, `vitest` | Yes |
| `.github/workflows/web-ci.yml` | `apps/web/**`: lint, `next build` | Yes |
| `.github/workflows/acceptance-e2e.yml` | Playwright system suite | **No** (`continue-on-error: true`) |

The acceptance workflow is deliberately informational: its own header
documents that it was authored before the platform existed and is expected
to be red until the full stack is deployed. It is not a gate for ordinary
feature PRs. Two other workflows in `.github/workflows/` — `main.yml` (a
third-party AI PR reviewer) and `deploy-gcp.yml` (a standalone Cloud Run
deploy of only the Go service) — predate the multi-tenant platform and are
not part of this submission's CI/CD story; see
[`ARCHITECTURE.md` §8](../ARCHITECTURE.md#8-deployment-topologies).

## Playwright acceptance suite

Two specs under `tests/e2e/`, run with `playwright.config.ts` at the repo
root:

- **`platform-onboarding-and-search.spec.ts`** — drives the browser UI:
  register -> log in -> create a FREE org -> seed the sample catalog ->
  search a known product -> see it in results -> see a non-zero usage
  counter. Couples only to the `data-testid` attributes frozen in
  `CONTRACT.md` §7, never CSS classes.
- **`tenant-isolation-and-quota.spec.ts`** — API-level (via
  `APIRequestContext`, never touching Go/Meilisearch/Postgres/Redis
  directly): creates two orgs, indexes a uniquely-marked document into org
  A, confirms org B's search returns zero hits for that marker even when a
  forged `X-Tenant-ID` header pointing at org A is attached to a request
  scoped to org B's slug; then hammers a FREE org's search endpoint until
  `429`, upgrades to PRO, and confirms the PRO quota allows strictly more
  successful requests in a subsequent window.

Run against any live stack (Docker Compose `--profile full` or the k3d
deployment):

```bash
E2E_BASE_URL=http://localhost:3000 \
E2E_API_URL=http://localhost:8080 \
E2E_EMAIL=assessor@e2e.test \
E2E_PASSWORD='Passw0rd!e2e' \
npx playwright test
```

Note the quota spec sets `test.setTimeout(180_000)` because it deliberately
waits out a full rate-limit window after the plan upgrade — expect that one
test to take up to ~2-3 minutes even when everything is healthy.

## Load generator

`load/` is a Locust-based synthetic multi-tenant load generator that talks
**only** to the public control-plane HTTP API (never Go/Meilisearch/Postgres/
Redis directly). Full details in [`load/README.md`](../load/README.md).

Five synthetic tenants, doc counts scaled together via `CATALOG_SCALE`:

| Tenant | Org | Plan | Full-scale docs |
|---|---|---|---|
| T1 | large-webshop | PRO | 10,000 |
| T2 | medium-webshop | PRO | 3,000 |
| T3 | recommendations | FREE | 5,000 |
| T4 | merchandising | FREE | 1,000 |
| T5 | analytics | FREE | 2,000 |

Scenarios (`SCENARIO` env var): `baseline` (steady traffic across all 5),
`noisy` (T1 sustains high-rate PRO traffic), `burst` (T3 alternates a stable
rate with rapid-fire burst windows on a duty cycle), `indexquery` (T2
continuously appends documents while everyone keeps searching). `429`s are
expected and counted separately per tenant — they are the per-org quota
working as designed, not failures.

```bash
cd load
pip install -r requirements.txt
LOCUST_HOST=http://localhost:8080 E2E_EMAIL=assessor+loadgen@e2e.test \
  E2E_PASSWORD='<pick-your-own>' CATALOG_SCALE=0.02 python3 seed.py
LOCUST_HOST=http://localhost:8080 SCENARIO=baseline \
  locust -f locustfile.py --headless -u 10 -r 2 -t 60s --csv=results/baseline
```

Sample validation-run numbers (not a performance benchmark or capacity
claim) are recorded in [`docs/load-test-results.md`](load-test-results.md),
including a note on a sandbox-specific Docker build networking issue
encountered while producing that particular run.

## Test commands quick reference

```bash
# Go search-api: unit tests + vulnerability scan
go test -v -race -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
govulncheck ./...

# Control plane (Fastify): type-check, build, unit/integration tests
cd apps/control-plane
npm ci
npm run lint    # tsc --noEmit
npm run build   # tsc + prisma generate
npm test        # vitest run — see src/__tests__/{auth,organizations,search}.test.ts

# Admin UI (Next.js): lint + build
cd apps/web
npm ci
npm run lint
npm run build

# Playwright acceptance suite (repo root, against a running stack)
npm ci
npx playwright install --with-deps chromium
E2E_BASE_URL=... E2E_API_URL=... E2E_EMAIL=... E2E_PASSWORD=... npx playwright test
```

## Assessor accounts / configuration

There are no pre-seeded accounts — signup is self-service but gated by an
allowlist. `ALLOWED_SIGNUP_EMAILS` (control-plane env var) accepts either a
full email (`alice@corp.com`) or an `@domain` entry matching any local-part
at that domain (case-insensitive). Every environment in this repo
(`.env.example`, `docker-compose.yml`, `infra/k8s/overlays/local/configmap-patch.yaml`,
CI) defaults this to include `@e2e.test`, so any `*@e2e.test` address —
including plus-addressed ones like `assessor+<run-id>@e2e.test` used by the
acceptance suite and load generator to avoid "already registered" collisions
— can self-register. To evaluate manually, just sign up through the Admin
UI with any `@e2e.test` address and a password of your choosing.

## Security controls (summary)

Condensed from [`THREAT_MODEL_ANALYSIS.md`](../THREAT_MODEL_ANALYSIS.md) —
that document is written at a somewhat more general level than this specific
codebase, so we reconcile it here against what's actually implemented:

- **Authentication**: JWT issued by control-plane on register/login
  (`@fastify/jwt`), verified on every protected route (`requireAuth`).
- **Authorization (RBAC)**: per-membership role (`OWNER`/`ADMIN`/`MEMBER`)
  checked server-side per route (`requireRole`); never trusts a client-sent
  role.
- **Multi-tenant isolation**: tenant ID is always resolved server-side from
  the authenticated user's verified membership, never taken from client
  input; the Go service additionally rejects any request missing
  `X-Tenant-ID` rather than defaulting to a shared/global index. See
  `ARCHITECTURE.md` §3-4 and the isolation acceptance test.
- **Rate limiting / quota**: Redis-backed, fixed-window, organization-scoped
  counters enforced by control-plane before proxying to search; distinct
  from (and authoritative over) the Go service's older per-IP limiter, which
  only applies to legacy routes that are not exposed publicly in this
  deployment.
- **Input validation**: Zod schemas on every control-plane request body/
  query param that accepts client input; typed struct binding on the Go
  side.
- **Secrets**: `.env` files are gitignored; k8s secrets are plain
  `Secret` objects with placeholder values for local use only (see
  [GKE](#gke-not-deployed) for the intended production path via Secret
  Manager — not implemented here).
- **Dependency scanning**: `govulncheck` runs in CI on every push/PR against
  the Go module.
- **Not implemented / out of scope for this submission**: TLS/cert-manager
  on the local Ingress (plain HTTP is sufficient for local acceptance
  testing), audit logging/alerting dashboards, HPA/autoscaling, a
  backup-upload CronJob. These are called out as `TODO` in the threat
  model's own checklist and are not silently glossed over here.

## Known limitations

- GKE overlay is manifests-only; no live GKE deployment exists for this
  submission.
- Postgres and Meilisearch run as single-replica StatefulSets — no HA,
  manual `pg_dump` backup only, no automated restore path.
- Redis has no PVC; a rate-limit counter reset on pod restart is acceptable
  (it's not durable business state) but is a real behavior change worth
  knowing about.
- The Go service's legacy per-IP rate limiter and public-style routes
  (pre-dating the control plane) still exist in the codebase for migration
  continuity but are not exposed through the Ingress and are not the quota
  mechanism this submission should be evaluated against.
- `docs/ARCHITECTURE_DIAGRAMS.md`, `docs/SWAGGER_UI_GUIDE.md`, and
  `docs/swagger.yaml` / `docs/specs/swagger.json` describe the project's
  earlier single-service (pre-multi-tenant) design and are retained for
  history; they are superseded by `ARCHITECTURE.md`, `CONTRACT.md`, and this
  runbook.
- No HPA/autoscaling is configured in the k8s manifests (optional per the
  task brief).

## Five-minute demo

1. **Bring up the stack** (Docker Compose is fastest for a demo):
   ```bash
   cp .env.example .env && docker compose --profile full up --build
   ```
   Wait for `control-plane` and `web` to report healthy (~30-60s after
   Postgres/Redis/Meilisearch pass their health checks).
2. **Open the Admin UI** at `http://localhost:3000`. Sign up with
   `demo@e2e.test` / any password (allow-listed by default).
3. **Create an organization** — note the `plan-badge` shows `FREE`.
4. **Seed the sample catalog** via the "seed catalog" action — this batches
   documents into your org's isolated Meilisearch index
   (`tenant_<your-org-uuid>_articles`).
5. **Search** for a known seeded term (e.g. `Nike`) and see it appear in
   results; note the usage counter increments.
6. **Show tenant isolation**: create a second organization, search for the
   same term there, and see zero results — the second org has its own,
   empty index.
7. **Show quota enforcement**: repeat a search rapidly (or use
   `load/seed.py` + a `locust` `burst` run against this stack) until you see
   a `429` and the usage panel's rate-limit counter increment; then
   `PATCH /organizations/:slug/plan` to `PRO` and show the higher ceiling.
8. *(Optional, if you have k3d available)* Repeat steps 2-7 against
   `http://web.localtest.me:8088` after following
   [Local Kubernetes (k3d)](#local-kubernetes-k3d), to demonstrate the same
   behavior on the actual acceptance-target runtime.
