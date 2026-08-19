# Documentation hub

A multi-tenant search SaaS: organizations sign up, manage members and roles, seed
their own product catalog, and search it through a **per-tenant isolated search
index**, under plan-based quotas with usage tracking. It runs in production on GKE
Autopilot and locally on Docker Compose / k3d.

This page is the **starting point**. It presents the system at a glance and routes
you to the detailed, authoritative document for each topic — nothing important is
duplicated here, so every link is the single source of truth for its subject.

---

## Who this is for & how to read it

**Assessor / professor — evaluating the submission.** Read in this order:

1. **What it is & how it fits together** → this page, then
   [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the narrative and
   [`ARCHITECTURE_DIAGRAMS.md`](ARCHITECTURE_DIAGRAMS.md) for the rendered
   runtime + CI/CD diagrams.
2. **Run & evaluate it** → the [Submission runbook](SUBMISSION_RUNBOOK.md): bring-up
   (Compose / k3d / GKE), assessor account setup, test commands, and a five-minute
   demo script.
3. **Judge the design** → the three deep-dives below (data model, threat model,
   cloud architecture) plus the frozen API contract.

**Developer — working on the code.** Start with the root
[`../README.md`](../README.md) quickstarts, keep [`../CONTRACT.md`](../CONTRACT.md)
open as the cross-component interface, and use the deep-dive index at the bottom.

---

## The system at a glance

Two **public** services (a Next.js Admin UI and a Fastify control plane) sit behind
the Ingress; four **internal-only** services (the Go search-api, PostgreSQL, Redis,
Meilisearch) are never externally routable. The control plane owns all identity,
membership, RBAC, plans, and quotas, and is the *only* thing that turns a request
into a tenant: it authenticates the caller, resolves the org, checks membership, and
passes a **trusted, server-derived `X-Tenant-ID`** to the search tier — external
clients can never choose the tenant.

```
Browser / Load generator
          |
   Ingress / Gateway
      |         |
   Next.js    Fastify   (PUBLIC)
   Admin UI   Control Plane
                 |
        +--------+---------+
        |        |         |
   PostgreSQL   Redis   Go Search API   (INTERNAL / ClusterIP only)
                            |
                       Meilisearch      (INTERNAL)
```

Full narrative + mermaid topology: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §1–§4.
Rendered production diagrams: [`ARCHITECTURE_DIAGRAMS.md`](ARCHITECTURE_DIAGRAMS.md).

---

## Onboard by topic

### Data model
The system of record is PostgreSQL, managed by Prisma from the control plane. Four
entities: **`User`**, **`Organization`** (with `plan` FREE|PRO and a unique `slug`),
**`Membership`** (the join table that both grants org access and carries the RBAC
role OWNER|ADMIN|MEMBER), and **`UsageEvent`** (written on every search/index
attempt — success and failure — powering usage counters and quotas). Search
documents themselves live outside Postgres, in a per-tenant Meilisearch index
`tenant_<normalized-org-uuid>_articles`.
→ [`../ARCHITECTURE.md`](../ARCHITECTURE.md#5-data-model-postgresql-owned-by-control-plane--prisma)
· frozen shapes in [`../CONTRACT.md`](../CONTRACT.md) §5 · schema source
`apps/control-plane/prisma/schema.prisma`.

### Threat model & security
The design invariant is tenant isolation (external callers never choose the tenant
ID); the threat model documents that trust boundary in code and test, plus eight
threat categories with concrete mitigations — auth/JWT expiry, RBAC & privilege
escalation, org-scoped rate limiting that **fails closed**, injection handling,
per-tenant physical index separation, sanitized error handling, secrets handling
(k8s Secrets locally, GCP Secret Manager in prod), and dependency scanning — with a
negative-path test-coverage table and an honest residual-risk / out-of-scope list.
→ [`../THREAT_MODEL_ANALYSIS.md`](../THREAT_MODEL_ANALYSIS.md).

### Cloud architecture & deployment
Production is **GKE Autopilot** (`saas-gke`, europe-west3, namespace `saas`) behind a
GCE Ingress with a static IP and Google-managed TLS, serving
`web.criticalmars.me` / `api.criticalmars.me`. Kubernetes manifests are Kustomize
(`base` + `overlays/{local,gke}`); infrastructure (cluster, Artifact Registry,
Workload Identity Federation, static IP, Secret Manager) is Terraform; application +
schema ship via `deploy-gke.yml` on push to `main` with rollout auto-rollback.
→ Runtime & k8s specifics: [`../infra/README.md`](../infra/README.md) ·
GKE overlay: [`../infra/k8s/overlays/gke/README.md`](../infra/k8s/overlays/gke/README.md) ·
Terraform: [`../infra/terraform/README.md`](../infra/terraform/README.md) ·
rendered CI/CD diagram: [`ARCHITECTURE_DIAGRAMS.md`](ARCHITECTURE_DIAGRAMS.md).

### API contract
[`../CONTRACT.md`](../CONTRACT.md) is the frozen, cross-component contract: the public
Fastify HTTP surface with request/response shapes, the internal Go API, the data
model, rate limits, and the UI `data-testid`s the acceptance suite couples to. A
condensed endpoint table is in the root [`../README.md`](../README.md#api-summary).

---

## Run & evaluate it

[`SUBMISSION_RUNBOOK.md`](SUBMISSION_RUNBOOK.md) is the single linear path:
Docker Compose / k3d / GKE bring-up, Postgres backup, the CI/CD workflow table, the
Playwright acceptance suite, the load generator, test commands, assessor account
setup, a security-controls summary, known limitations, and a five-minute demo.

---

## Deep-dive index

| Area | Document |
|---|---|
| System narrative, trust boundary, data model, CI/CD | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Rendered runtime + CI/CD diagrams (GKE) | [`ARCHITECTURE_DIAGRAMS.md`](ARCHITECTURE_DIAGRAMS.md) |
| Frozen cross-component API contract | [`../CONTRACT.md`](../CONTRACT.md) |
| Threat model & security analysis | [`../THREAT_MODEL_ANALYSIS.md`](../THREAT_MODEL_ANALYSIS.md) |
| Run / evaluate / demo the system | [`SUBMISSION_RUNBOOK.md`](SUBMISSION_RUNBOOK.md) |
| Kubernetes runtime (k3d + GKE), secrets, backups | [`../infra/README.md`](../infra/README.md) |
| GKE overlay specifics & first-deploy checklist | [`../infra/k8s/overlays/gke/README.md`](../infra/k8s/overlays/gke/README.md) |
| Terraform-provisioned infrastructure | [`../infra/terraform/README.md`](../infra/terraform/README.md) |
| Observability & per-tenant SLAs (design; not yet applied) | [`observability.md`](observability.md) · [`../infra/monitoring/README.md`](../infra/monitoring/README.md) |
| Load generator (Locust) | [`../load/README.md`](../load/README.md) |
| Sample load-test run (illustrative, not a benchmark) | [`load-test-results.md`](load-test-results.md) |
| Seed catalogs & data pipeline | [`../data/README.md`](../data/README.md) |
| Developer scripts | [`../scripts/README.md`](../scripts/README.md) |
| Architecture Decision Records | [`../decisions/README.md`](../decisions/README.md) |

---

## Development workflow

Trunk-based development with short-lived feature branches. All changes land on
`main` through a pull request (never a direct push), squash-merged after CI passes;
each branch addresses a single concern. A merge to `main` triggers the GKE
production deploy (`.github/workflows/deploy-gke.yml`).
