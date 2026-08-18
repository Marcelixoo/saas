# Multi-Tenant Search SaaS — Architecture

The platform runs in production on **GKE Autopilot** (`saas-gke`, region `europe-west3`,
namespace `saas`) and is live at **https://web.criticalmars.me** (Admin UI) and
**https://api.criticalmars.me** (control plane). Local development and the automated
acceptance suite run the same services on docker-compose / k3d.

---

## Runtime architecture

![Runtime topology: the browser reaches the GCE Ingress over HTTPS; the Ingress routes web.criticalmars.me to the Next.js web service and api.criticalmars.me to the Fastify control-plane. The control-plane calls the internal search-api (passing a trusted X-Tenant-ID), PostgreSQL via Prisma, and Redis; the search-api queries Meilisearch. The search-api, PostgreSQL, Redis and Meilisearch sit inside a trust boundary as ClusterIP-only services with no external route.](img/architecture-runtime.png)

**Request path.** The browser loads the Admin UI from `web.criticalmars.me` and calls the
control plane at `api.criticalmars.me`. Both hostnames resolve (A records) to the reserved
global static IP **`136.68.233.26`**, fronted by a **GCE Ingress** that terminates a
Google-managed TLS certificate and redirects HTTP→HTTPS.

**Components.**

| Service | Tech | Port | Exposed by Ingress? | Role |
|---|---|---|---|---|
| `web` | Next.js Admin UI | 3000 | **Yes** — `web.criticalmars.me` | Operator/admin console (2 replicas) |
| `control-plane` | Fastify (Node) | 8080 | **Yes** — `api.criticalmars.me` | Public API: auth (JWT + RBAC), org/tenant management, rate limiting, usage, search proxy (2 replicas) |
| `search-api` | Go / Gin | 8081 | No — ClusterIP | Tenant-scoped search execution (2 replicas) |
| `postgres` | PostgreSQL (StatefulSet) | 5432 | No — ClusterIP | Users, orgs, memberships, usage events |
| `redis` | Redis | 6379 | No — ClusterIP | Rate-limit counters and usage tracking |
| `meilisearch` | Meilisearch (StatefulSet) | 7700 | No — ClusterIP | Full-text/relevance index |

**Trust boundary (multi-tenancy).** Only `web` and `control-plane` are bound to the Ingress;
`search-api`, `postgres`, `redis`, and `meilisearch` are `ClusterIP` services with **no
external route**. External callers never choose a tenant — the control plane authenticates the
request and injects a **trusted `X-Tenant-ID`** header before calling `search-api`, which reads
a per-tenant Meilisearch index named `tenant_<normalized-uuid>_articles`. A forged tenant
header from the outside cannot reach the search tier because that tier is not routable from the
Ingress.

**Data flow.** `control-plane` → `postgres` (via Prisma ORM) for relational state,
`control-plane` → `redis` for rate-limit/usage counters, and `control-plane` → `search-api`
for search; `search-api` → `meilisearch` for the actual query. The control plane's health probe
is `GET /healthz`, and it applies database migrations (`prisma migrate deploy`) on startup.

---

## Delivery pipeline (CI/CD)

![CI/CD pipeline: a git push to main (or a v* tag or manual dispatch) triggers GitHub Actions deploy-gke.yml, which authenticates via Workload Identity Federation, builds and pushes the three images to Artifact Registry, syncs saas-secrets from Secret Manager, runs kubectl apply on the GKE overlay, then waits for rollout — automatically running rollout undo back to the last-good revision on failure.](img/architecture-cicd.png)

**Trigger & gate.** A push to `main`, a `v*` tag, or a manual `workflow_dispatch` runs
`.github/workflows/deploy-gke.yml`. A `check-config` gate requires 7 repository variables and
**skips** (does not fail) the deploy if any are missing.

**Steps.**
1. **Authenticate** to Google Cloud via **Workload Identity Federation** — no long-lived
   service-account key is ever stored.
2. **Build & push** the three images (`web`, `control-plane`, `search-api`), each tagged with
   the commit SHA, to **Artifact Registry** (`europe-west3-docker.pkg.dev/criticalmars-saas-505914/saas`).
3. **Sync secrets** — read each value from **GCP Secret Manager** and materialize the
   Kubernetes Secret `saas-secrets` (the Deployments consume it via `secretKeyRef`).
4. **Deploy** — `kustomize edit set image` then `kubectl apply -k infra/k8s/overlays/gke`.
5. **Wait for rollout with auto-rollback** — if any Deployment fails to become healthy, the job
   runs `kubectl rollout undo` back to the last-good revision, re-verifies it, and fails the
   build, leaving the cluster on its last-good state.

**What ships via CD vs. Terraform.** Application code **and** the database schema
(`prisma migrate deploy` runs on control-plane startup) ship on a push to `main` — no manual
`kubectl`. Infrastructure (the cluster, Artifact Registry, WIF, static IP, and Secret Manager
secrets) is provisioned by **Terraform** in `infra/terraform/` and applied manually — infra
changes are reviewed plans, not push-to-deploy.

**Rollout safety.** Every Deployment has readiness + liveness probes and uses the default
`RollingUpdate` strategy, so a broken release never becomes Ready and the previous ReplicaSet
keeps serving (no downtime); the auto-rollback step then reverts the stuck rollout. Caveat:
`rollout undo` reverts the pod template only (not ConfigMap/Secret changes), and forward DB
migrations are not reverted — migrations must stay backward-compatible.

---

## Infrastructure (Terraform, `infra/terraform/`)

Provisioned by Terraform and applied manually with Application Default Credentials:

- **GKE Autopilot** cluster `saas-gke` (europe-west3).
- **Artifact Registry** repository for the three service images.
- **Workload Identity Federation** pool + provider, scoped to the `Marcelixoo/saas`
  repository, bound to a **least-privilege deployer service account** (GKE deploy + Artifact
  Registry push only).
- **Global static IP** (`136.68.233.26`) for the Ingress.
- **Secret Manager** secrets whose values are generated by `random_password` (never committed
  to git; Terraform state is git-ignored), each granting the deployer SA per-secret
  `roles/secretmanager.secretAccessor`.

---

## Security architecture

- **Transport** — Google-managed TLS certificate at the Ingress; HTTP→HTTPS redirect via a
  FrontendConfig.
- **AuthN/AuthZ** — JWT authentication with role-based access control (admin / billing /
  member) in the control plane.
- **Tenant isolation** — the trust boundary above: internal services are `ClusterIP`-only, the
  control plane injects a trusted `X-Tenant-ID`, and each tenant has its own search index.
- **Rate limiting** — per-principal limits backed by Redis; fails closed on a Redis outage.
- **Secrets** — GCP Secret Manager is the source of truth, materialized into the cluster at
  deploy time; no plaintext secret values live in git.
- **CI/CD trust** — Workload Identity Federation issues short-lived tokens per run (no
  long-lived keys); the deployer service account is scoped to exactly what the deploy needs.

---

## At a glance

- **Production**: GKE Autopilot · `saas-gke` · europe-west3 · namespace `saas`
- **Public hosts**: `web.criticalmars.me`, `api.criticalmars.me` → `136.68.233.26`
- **TLS**: Google-managed certificate · HTTP→HTTPS redirect
- **Isolation**: 4 internal services `ClusterIP`-only; per-tenant search index; trusted `X-Tenant-ID`
- **Secrets**: GCP Secret Manager → `saas-secrets` at deploy time
- **Auth to GCP**: Workload Identity Federation — no long-lived keys
- **Local/dev & acceptance**: docker-compose / k3d (`infra/k8s/overlays/local`); Playwright acceptance suite

---

## Regenerating the diagrams

The two images above are rendered from self-contained HTML/SVG sources (hand-drawn style via an
SVG turbulence filter, labels in the Kalam typeface). To regenerate, open the source in a
browser and export, or screenshot at 2× for a crisp PNG. Source lives with the docs tooling; keep
the PNGs in `docs/img/` in sync when the architecture changes.

---

**Last Updated**: 2026-08-18
**Version**: 3.0.0
