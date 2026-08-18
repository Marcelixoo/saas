# Production observability: alerting + per-tenant SLAs

Status: design + draft implementation. The Terraform in `infra/monitoring/` has been
validated (`terraform validate`, `terraform fmt`) but **not applied**; nothing in this
document has been deployed to prod. See `infra/monitoring/README.md` for apply
instructions when someone signs off on it.

## 0. Motivation

On 2026-08-18, `meilisearch-0` OOM-looped (`exit 137`) against its old 512Mi memory limit
once a real catalog was on disk. `search-api` and `control-plane` both block on Meilisearch
via init containers, so the entire public API was down. `deploy-gke.yml`'s rollout-wait
correctly detected the bad state and attempted an automatic rollback, but the rollback also
couldn't become healthy (same OOM ceiling), and — critically — **nothing paged anyone**. The
outage was noticed only when a human hit the UI, hours later. The immediate fix raised
Meilisearch's memory limit to 4Gi; this document is the follow-up: catch this entire class of
failure within minutes, automatically, and give it a name (per-tenant SLAs) so a future
regression is caught before a human notices by hand.

Everything below targets **GKE Autopilot** with **no additional self-hosted stack** —
Cloud Monitoring/Logging (already billed as part of GKE) covers alerting, uptime checks, and
log-based metrics; nothing here requires standing up Prometheus/Grafana/Alertmanager.

## 1. Alerting on pod health (the incident itself)

Three independent Cloud Monitoring alert policies, implemented in `infra/monitoring/alerts.tf`:

| Policy | Signal | Why it exists |
|---|---|---|
| `saas-container-restarting` | `kubernetes.io/container/restart_count`, delta > threshold (default 3) over a 5 min window | Catches CrashLoopBackOff generically — any container, any cause |
| `saas-oom-killed` | Log-based metric on Kubernetes `OOMKilling` events (Cloud Logging) | Catches the *exact* failure mode from the outage directly, with no ambiguity, independent of the heuristic above |
| `saas-memory-approaching-limit` | MQL ratio of `container/memory/used_bytes` to `container/memory/limit_bytes` > 90% | Early warning **before** the kernel OOM-kills anything — this is the one that would have caught the incident hours earlier, while Meilisearch was still serving |

All three notify the same `google_monitoring_notification_channel` (email today; the file
has a commented-out template for adding a Slack webhook channel later without touching the
alert policies).

Why not just "any restart"? A rolling deploy restarts pods on purpose. The restart-count
policy alone would be noisy without the delta-over-window aggregation; the OOM-specific
log-based metric is the highest-signal, lowest-noise policy of the three and is the one
worth trusting most if only one exists.

## 2. Uptime checks (web + api)

`infra/monitoring/uptime.tf` provisions two Cloud Monitoring **uptime checks**, each with its
own alert policy so the associated documentation/runbook link is on-topic:

- `saas-web-uptime` → `https://web.criticalmars.me/`
- `saas-api-healthz-uptime` → `https://api.criticalmars.me/healthz`

These are checked from multiple Google-operated regions every 60s (configurable via
`uptime_check_period_seconds`); the alert fires only once the success rate drops to zero
across regions for two consecutive checks, so a single flaky checker region doesn't page
anyone. This is deliberately black-box and independent of the pod-health alerts in §1 — it
also catches failure modes those can't see: DNS misconfiguration, an expired/stuck
GKE-managed certificate, an Ingress/load-balancer problem, or (as in the actual incident) a
downstream dependency that keeps the pod "Running" but never "Ready".

## 3. Deploy-failure notification

`deploy-gke.yml` already fails and auto-rolls-back on a rollout timeout (see the "Wait for
rollout" step) — but until now that failure only showed up as a red run in the Actions tab,
which nobody watches proactively. A new `notify-on-failure` job runs whenever
`build-and-deploy` fails for any reason, and posts to a Slack **Incoming Webhook** if one is
configured (`SLACK_DEPLOY_WEBHOOK_URL` repo secret). If the secret isn't set, the job
no-ops (prints a `::notice::` and exits 0) — adding this job never breaks CI for anyone who
hasn't wired up a webhook yet, and no secret value is ever echoed or logged.

This is a distinct signal from the alert policies in §1/§2: it fires immediately on a *known*
deploy failure (including one whose rollback also failed to heal), rather than waiting on a
metric/log condition to cross a threshold — in the actual incident, this alone would have
alerted someone within the same GitHub Actions run, not hours later.

## 4. Resource-headroom alerts

Covered by `saas-memory-approaching-limit` in §1 — called out separately here because it's
also the mechanism for right-sizing: `infra/k8s/overlays/gke/production-patch.yaml`
currently gives Meilisearch a deliberately generous 1Gi request / 4Gi limit ("generous
headroom now; right-size later once we have memory observability" — see that file's
comment). Once this alert has been live for a while with no fires, working-set data in
Cloud Monitoring's Metrics Explorer can inform tightening that limit with actual evidence
instead of guessing.

## 5. Per-tenant SLAs

### 5.1 What we're promising

Per `CONTRACT.md`, every organization has a `plan` of `FREE` or `PRO`, already used to size
Redis search rate limits (`FREE_SEARCH_LIMIT=30/min`, `PRO_SEARCH_LIMIT=300/min`). SLAs
extend that same tiering to availability and latency:

| | FREE | PRO |
|---|---|---|
| Availability SLO (monthly) | 99.0% | 99.9% |
| Search p95 latency SLO | < 800ms | < 300ms |
| Search p99 latency SLO | < 2000ms | < 800ms |
| Error budget (monthly, availability) | ~7h 18m | ~43m |

These are *targets to instrument against*, not commitments already backed by a contract with
customers — the platform currently has none. They're deliberately modest relative to what a
single-replica, in-cluster Postgres/Redis/Meilisearch stack can actually promise (see
`CONTRACT.md` §1: no managed-Postgres/managed-Redis HA yet), and are meant to be tightened
once the instrumentation below produces real numbers to tighten them against.

### 5.2 How to measure it

**Availability** per tenant is not directly measurable from the uptime checks in §2 — those
are global (the whole API up/down), not scoped to one organization. The right approach is a
per-tenant *success rate*: `(requests that got a 2xx/3xx) / (total requests)` over the
tenant's own traffic, which degrades gracefully to "not applicable" for a tenant that made
zero requests in the window (rather than reading as 100% or 0%).

**Latency** per tenant is a distribution (p50/p95/p99), not an average — a single slow
search shouldn't be hidden by many fast ones, which is exactly what an SLA cares about.

**Instrumentation status — implemented (this PR), minimal slice:**

search-api (`pkg/logging/middleware.go`'s `RequestLogger`) already attaches `tenant_id` to
its one-structured-log-line-per-request via `pkg/logging.GetTenantID`, but nothing was ever
calling `SetTenantID` for the tenant-scoped internal routes — so the field was silently
always empty for exactly the requests that matter for tenant SLAs. This PR:

1. Adds `logging.SetTenantID` (`pkg/logging/context.go`) and calls it from
   `requireTenantID` (`internal/handlers/internal_search.go`), which validates the trusted
   `X-Tenant-ID` header before every internal search/document-batch request — so the log
   line is now genuinely tenant-labeled.
2. Adds a top-level `latency_ms` (numeric) field to the same log line, alongside the
   existing human-readable `httpRequest.latency` string, so a Cloud Logging log-based
   *distribution* metric can extract `jsonPayload.latency_ms` directly without parsing a Go
   duration string.

Together, every `/internal/search` and `/internal/documents/batch` request now emits a
structured log line shaped like:

```json
{
  "request_id": "req_...",
  "tenant_id": "<organization UUID>",
  "latency_ms": 42,
  "httpRequest": { "requestUrl": "...", "status": 200, "latency": "42.1ms" }
}
```

**Instrumentation — proposed, not implemented (deliberately, to avoid scope creep):**

- **A log-based distribution metric** in `infra/monitoring/` (e.g.
  `logging.googleapis.com/user/saas_tenant_search_latency_ms`) extracting `latency_ms`,
  labeled by `tenant_id`, from search-api's structured logs — this turns the log field above
  into a first-class Cloud Monitoring metric queryable per tenant without writing any new
  application code. Left out of this PR's Terraform because it needs the log line above to
  actually be flowing in prod first (to confirm the JSON field path Cloud Logging extracts
  matches what's emitted) — the natural very-next PR.
- **Plan-aware alert thresholds**: once the per-tenant metric exists, a monitoring-side join
  against `Organization.plan` (control-plane's Postgres) isn't directly expressible in Cloud
  Monitoring — the practical approach is a small periodic job/query (e.g. a scheduled Cloud
  Function or a control-plane cron route) that reads the per-tenant latency/error-rate metric
  from Cloud Monitoring, joins it against each org's plan, and emits its own log line
  (`sla_breach: true, organization_id, plan`) that a log-based alert policy watches — because
  Cloud Monitoring alert policies can't natively join metrics against relational application
  data.
- **control-plane-side per-tenant instrumentation**: control-plane (Fastify) already has
  `request.log` (pino) but no per-request tenant-scoped timing; the natural touch point is a
  Fastify `onResponse` hook in `apps/control-plane/src/app.ts` (near where `cors`/`jwt` are
  registered) reading the resolved `organizationId` set by the tenant-resolution step
  described in `CONTRACT.md` §2, mirroring the shape added to search-api. Left as a proposal
  because it's a second, separate codebase/language and doubling the instrumentation surface
  in one PR risks sprawl for marginal near-term benefit (search-api is the hop that actually
  talks to Meilisearch, i.e. where the outage-class latency shows up first).

### 5.3 Error budgets

With the SLOs in §5.1: a PRO tenant's 99.9% monthly availability target burns its ~43-minute
error budget the same way any SRE error budget works — spend it on deploys/experiments early
in the month, freeze risky changes once a meaningful fraction is gone. Nothing here
automates budget tracking yet (that requires the per-tenant availability metric from §5.2 to
exist first); once it does, the budget is just `(1 - SLO) * time_window` compared against the
measured downtime, and is cheap to compute as a scheduled query rather than a new service.

### 5.4 How a tenant breach surfaces

Deliberately **not** as an on-call page in `infra/monitoring/` — a single tenant's SLA
breach is a customer-support/business signal (does this account need an apology, a credit,
an upgrade conversation?), not an infrastructure incident, and paging on it would train
whoever's on call to ignore pages. The proposed path (§5.2, "plan-aware alert thresholds")
is a log line the *support/business* side can dashboard or alert on independently, decoupled
from the infra on-call rotation. A **global** SLA breach (e.g. every tenant's p99 spikes) is
already covered by the infra alerts in §1 whether or not per-tenant tracking exists.
