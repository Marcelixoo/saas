# Multi-tenant search SaaS platform

A multi-tenant SaaS platform that lets organizations sign up, manage
membership/roles, and search their own catalog of documents through an
isolated, per-tenant search index — with plan-based quotas and usage
tracking.

This README is the entry point for an assessor evaluating the submission.
For the frozen cross-component contract, see [`CONTRACT.md`](CONTRACT.md).
For component responsibilities and the tenant-isolation trust boundary, see
[`ARCHITECTURE.md`](ARCHITECTURE.md). For step-by-step bring-up, test
commands, and a demo script, see
[`docs/SUBMISSION_RUNBOOK.md`](docs/SUBMISSION_RUNBOOK.md).

## What's here

- **`apps/control-plane/`** — Fastify + Prisma + PostgreSQL control plane.
  The only public entry point for auth, organizations, RBAC, plans, quotas,
  and usage. Owns the tenant-isolation trust boundary (see
  [`ARCHITECTURE.md` §3](ARCHITECTURE.md#3-trust-boundary-tenant-isolation)).
- **`apps/web/`** — Next.js Admin UI (signup/login, org management, catalog
  seeding, search, usage counters).
- **`cmd/`, `internal/`, `pkg/`** — Go search API. Internal-only; multi-tenant
  via per-tenant Meilisearch indexes (`tenant_<uuid>_articles`), driven only
  by a trusted `X-Tenant-ID` header set by the control plane.
- **`infra/`** — Kustomize manifests for the live GKE production deployment
  and for local Kubernetes on k3d (acceptance target).
- **`load/`** — Locust-based synthetic multi-tenant load generator.
- **`tests/e2e/`** — Playwright system acceptance suite.
- **`docker-compose.yml`** — full local stack (data tier + both app tiers).

## Architecture at a glance

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

External clients never choose the tenant ID used downstream: control-plane
resolves `:slug -> organization UUID` itself after verifying membership, and
that trusted UUID — never anything from the request — is what reaches the
Go service as `X-Tenant-ID`. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the
full diagram, component responsibilities, and data model.

## Quickstart: local development (Docker Compose)

```bash
cp .env.example .env
# review .env — defaults are fine for local dev, do NOT reuse them anywhere real
docker compose --profile full up --build
```

This brings up `postgres`, `redis`, `meilisearch`, `search-api` (internal
only, no host port), `control-plane` (`http://localhost:8080`), and `web`
(`http://localhost:3000`). Running `docker compose up --build` **without**
`--profile full` starts only the data tier + Go search API, useful when
iterating on `search-api` alone.

Sign up with an email allow-listed by `ALLOWED_SIGNUP_EMAILS` (the default
`.env` allows `@e2e.test`, e.g. `assessor@e2e.test`).

## Quickstart: local Kubernetes (k3d)

The acceptance target for this submission is a real local Kubernetes
cluster, not just Docker Compose. Full instructions, secrets, and known
limitations are in [`infra/README.md`](infra/README.md) and condensed in
[`docs/SUBMISSION_RUNBOOK.md`](docs/SUBMISSION_RUNBOOK.md#local-kubernetes-k3d).
In short:

```bash
k3d cluster create saas --port "8088:80@loadbalancer" --agents 1 --wait
docker build -f infra/docker/search-api.Dockerfile -t saas/search-api:local .
docker build -f infra/docker/control-plane.Dockerfile -t saas/control-plane:local .
docker build -f infra/docker/web.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://api.localtest.me:8088 \
  -t saas/web:local .
k3d image import saas/search-api:local saas/control-plane:local saas/web:local -c saas
kubectl apply -k infra/k8s/overlays/local
kubectl -n saas get pods -w
```

Then the Admin UI is at `http://web.localtest.me:8088` and the API at
`http://api.localtest.me:8088` (no `/etc/hosts` edits needed —
`*.localtest.me` resolves publicly to `127.0.0.1`).

**Production:** `infra/k8s/overlays/gke/**` is live on a GKE Autopilot
cluster, serving https://web.criticalmars.me and https://api.criticalmars.me.
The k3d bring-up above is the local/CI acceptance path, not production — see
[`ARCHITECTURE.md` §8](ARCHITECTURE.md#8-deployment-topologies) and
[`docs/SUBMISSION_RUNBOOK.md`](docs/SUBMISSION_RUNBOOK.md#gke-production).

## API summary

See [`CONTRACT.md` §3](CONTRACT.md#3-public-fastify-http-contract) for full
request/response shapes. Highlights:

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /auth/register`, `POST /auth/login` | none | signup gated by `ALLOWED_SIGNUP_EMAILS` |
| `GET /me`, `GET /organizations`, `POST /organizations` | Bearer JWT | creator becomes `OWNER` |
| `PATCH /organizations/:slug/plan` | `OWNER`/`ADMIN` | `FREE` \| `PRO` |
| `GET /organizations/:slug/search?q=...` | member | quota-checked, tenant-isolated |
| `POST /organizations/:slug/documents/batch` | `OWNER`/`ADMIN` | indexes into that org's isolated index |
| `GET /organizations/:slug/usage` | member | search/index/rate-limit counters |

RBAC (`OWNER` / `ADMIN` / `MEMBER`), plan-based quotas (`FREE`/`PRO`,
env-configurable via `FREE_SEARCH_LIMIT`/`PRO_SEARCH_LIMIT`), and Redis
organization-scoped rate limiting are described in
[`ARCHITECTURE.md` §6](ARCHITECTURE.md#6-rbac-and-plans).

## Testing quick reference

```bash
# Go search-api
go test -race ./...
govulncheck ./...

# Control plane (Fastify)
cd apps/control-plane && npm test

# Admin UI (Next.js)
cd apps/web && npm run lint && npm run build

# Playwright acceptance suite (against a running stack — see docs/SUBMISSION_RUNBOOK.md)
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:8080 \
  E2E_EMAIL=assessor@e2e.test E2E_PASSWORD='Passw0rd!e2e' \
  npx playwright test

# Load generator (see load/README.md)
cd load && python3 seed.py && locust -f locustfile.py --headless -u 10 -r 2 -t 60s
```

Full details, env vars, assessor account setup, a five-minute demo script,
and known limitations are in
[`docs/SUBMISSION_RUNBOOK.md`](docs/SUBMISSION_RUNBOOK.md).

## Further reading

- [`CONTRACT.md`](CONTRACT.md) — frozen cross-component contract (topology,
  trust boundary, API shapes, data model, rate limits, `data-testid`s).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — component responsibilities, trust
  boundary explanation, data model, deployment topologies, CI/CD.
- [`docs/SUBMISSION_RUNBOOK.md`](docs/SUBMISSION_RUNBOOK.md) — bring-up steps
  for Docker Compose and local k3d, test commands, the load generator, the
  Playwright suite, assessor configuration, security-control summary, known
  limitations, and a five-minute demo script.
- [`infra/README.md`](infra/README.md) — Kubernetes runtime details (owned by
  the infra work; kept as the source of truth for k8s specifics).
- [`load/README.md`](load/README.md) — load generator details.
- [`decisions/README.md`](decisions/README.md) — Architectural Decision Records (ADRs).
- [`docs/load-test-results.md`](docs/load-test-results.md) — a sample
  validation run's numbers (not a performance benchmark or capacity claim).
- [`THREAT_MODEL_ANALYSIS.md`](THREAT_MODEL_ANALYSIS.md) — threat model and
  security checklist.
