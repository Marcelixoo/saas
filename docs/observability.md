# Production observability

This is the system's observability strategy, written to match what the repo
actually contains — not a wishlist. Cloud Monitoring Terraform in
`infra/monitoring/` has been `terraform validate`d but **has never been
applied**. Until someone applies that root, **nothing pages** from this
document, including the alerts that would have caught the 2026-08-18
Meilisearch OOM. See `infra/monitoring/README.md` for apply steps.

## Honest status

| Piece | In git | In prod |
|---|---|---|
| search-api per-request JSON logs (`tenant_id`, `latency_ms`) | yes (`pkg/logging`) | yes, once that build is on the cluster |
| control-plane customer-facing search SLI log (`sli_operation=search`, `plan`, `sli_result`) | this change | after control-plane rolls out |
| Pod-health alerts, uptime checks, email channel | `infra/monitoring/` | **not applied** |
| Log-based SLA metrics + `saas-tenant-slas` dashboard | `infra/monitoring/` | **not applied** (apply metrics, confirm series, then the dashboard) |
| Deploy-failure Slack post | `.github/workflows/deploy-gke.yml` | only if `SLACK_DEPLOY_WEBHOOK_URL` is set |
| Per-tenant pages / PagerDuty / traces / Prometheus | — | we don't have them |

There is no second observability stack. GKE Autopilot already ships container
logs and Kubernetes metrics to Cloud Logging / Cloud Monitoring. We add
structured fields to those logs, turn the useful ones into log-based metrics,
and alert on a small set of black-box and pod-health signals. No Prometheus,
Grafana, Alertmanager, or OpenTelemetry collector.

## Strategy

Two questions, two channels:

1. **Is the platform up?** Infra on-call. Global signals only: container
   restarts, OOM kills, memory approaching limit, HTTPS uptime on `web` and
   `/healthz`, and a GitHub Actions ping if a deploy (or its rollback) failed.
   A global search outage shows up here whether or not any tenant SLO exists.
2. **Is this tenant getting the search they paid for?** Support / business.
   Per-organization availability and latency for
   `GET /organizations/:slug/search`, split by the `FREE` / `PRO` plan in
   force at request time. This is a dashboard, not a page. Paging on a single
   quiet tenant trains people to ignore pages.

What we measure for (2) is the **customer-facing** hop, not the Meilisearch
hop. Auth, plan lookup, Redis quota, and the proxy to search-api are part of
what the tenant waited. A FREE org sitting on `FREE_SEARCH_LIMIT` gets 429s
that never reach search-api; counting those as downtime would make the SLO
a quota alarm. Indexing (`POST .../documents/batch`) is operationally
important and is logged, but it is not in the search SLO.

What we are **not** claiming: these numbers are not a customer contract. The
stack is still single-replica in-cluster Postgres, Redis, and Meilisearch
(`CONTRACT.md` §1). The targets below exist so we have something real to
tighten against once traffic exists, not so we can print "99.9%" on a
pricing page.

## 0. Motivation

On 2026-08-18, `meilisearch-0` OOM-looped (`exit 137`) against its old 512Mi
memory limit once a real catalog was on disk. `search-api` and `control-plane`
both block on Meilisearch via init containers, so the entire public API was
down. `deploy-gke.yml`'s rollout-wait correctly detected the bad state and
attempted an automatic rollback, but the rollback also couldn't become healthy
(same OOM ceiling), and **nothing paged anyone**. The outage was noticed only
when a human hit the UI, hours later. The immediate fix raised Meilisearch's
memory limit to 4Gi. Everything below is the follow-up: catch that class of
failure within minutes, and measure per-tenant search so a slower failure
mode has a name.

Until `infra/monitoring` is applied, that paging gap is still open.

## 1. Alerting on pod health (the incident itself)

Three independent Cloud Monitoring alert policies, in `infra/monitoring/alerts.tf`.
They notify one email channel (`notifications.tf`; a Slack webhook example is
commented there). They do not fire until the module is applied.

| Policy | Signal | Why it exists |
|---|---|---|
| `saas-container-restarting` | `kubernetes.io/container/restart_count`, delta > threshold (default 3) over a 5 min window | CrashLoopBackOff and friends, any container |
| `saas-oom-killed` | Log-based metric on Kubernetes `OOMKilling` events | The exact 2026-08-18 failure mode |
| `saas-memory-approaching-limit` | MQL ratio of `container/memory/used_bytes` to `container/memory/limit_bytes` > 90% | Warning **before** the kernel OOM-kills; this is the one that would have caught the incident while Meilisearch was still serving |

A rolling deploy restarts pods on purpose, so "any restart" is too noisy.
Delta-over-window plus a dedicated OOM metric keeps the page trustworthy.
If only one of these existed, trust the OOM policy.

## 2. Uptime checks (web + api)

`infra/monitoring/uptime.tf` — also unapplied until the module is:

- `saas-web-uptime` → `https://web.criticalmars.me/`
- `saas-api-healthz-uptime` → `https://api.criticalmars.me/healthz`

Checked from multiple Google regions every 60s. The alert fires only when
the success rate is zero across regions for two consecutive checks, so one
flaky checker does not page. This is black-box on purpose: it sees DNS,
expired managed certificates, Ingress/load-balancer failures, and
"Running but never Ready" (the actual incident) that pod metrics can miss.

These checks are **global**. They cannot tell a FREE tenant from a PRO one.

## 3. Deploy-failure notification

`deploy-gke.yml` fails and auto-rolls-back on a rollout timeout, but a red
Actions run is not a page. A `notify-on-failure` job posts to Slack when
`SLACK_DEPLOY_WEBHOOK_URL` is set, and no-ops (exit 0, `::notice::`) when
it isn't. No secret is echoed.

This is a different signal from §1/§2: it fires on a *known* deploy
failure, including a rollback that didn't heal, in the same Actions run.

## 4. Resource-headroom alerts

Same policy as `saas-memory-approaching-limit` in §1. Called out separately
because it is also how we right-size:
`infra/k8s/overlays/gke/production-patch.yaml` gives Meilisearch 1Gi
request / 4Gi limit on purpose. After that alert has been live with no
fires, working-set data in Metrics Explorer is what we use to tighten the
limit — not a guess.

## 5. Per-tenant search SLOs

### 5.1 Targets (instrument against these; do not sell them)

Same `FREE` / `PRO` split already used for Redis search quotas
(`FREE_SEARCH_LIMIT=30/min`, `PRO_SEARCH_LIMIT=300/min`):

| | FREE | PRO |
|---|---|---|
| Availability SLO (monthly) | 99.0% | 99.9% |
| Search p95 latency SLO | < 800ms | < 300ms |
| Search p99 latency SLO | < 2000ms | < 800ms |
| Error budget (monthly, availability) | ~7h 18m | ~43m |

### 5.2 What changed from the original §5 proposal

The first draft of this section treated search-api's `/internal/search` log
line as the SLI, left control-plane instrumentation as a follow-up, and
proposed a Cloud Function (or control-plane cron) to join Cloud Monitoring
series against `Organization.plan` in Postgres because "alert policies
can't join metrics to relational data."

That was more machinery than the question needed:

- The tenant's search is `GET /organizations/:slug/search` in control-plane.
  Quota 429s, 502/503 from a down search-api, and auth/proxy time all live
  on that request. search-api never sees the 429.
- `organization.plan` is already in hand after `resolveMembership`. Writing
  it on the log line is a low-cardinality label (`FREE` | `PRO`). Cloud
  Monitoring can filter on it. No join job, no extra service.
- A single-tenant breach still must not page infra. The original "plan-aware
  alert log line" is replaced by the `saas-tenant-slas` dashboard. A later
  support-email policy can reuse the same MQL; it should not use the infra
  channel in `notifications.tf`.

search-api's `tenant_id` + `latency_ms` line is still the right **dependency**
signal (how much of p95 is Meilisearch). It is no longer the SLO.

### 5.3 SLI definitions

Count a request only after membership resolved (so 401s and "org not found"
do not invent a tenant). Classify the final status:

| Status | `sli_result` | Availability | Latency distribution |
|---|---|---|---|
| 2xx / 3xx | `good` | success | yes |
| 4xx, including 429 | `excluded` | no | no |
| 5xx, including 502/503 | `error` | failure | no |

A tenant with only `excluded` traffic, or with no search traffic, produces
no availability or latency point — blank, not 0% or 100%.

Plan on the line is the plan **at request time**. An upgrade mid-month
splits that org into two series; each is judged against the tier that
served it.

Windows: trend charts use 1h; compliance / error-budget widgets use 30d.
Alert-policy alignment tops out near 24h, which is another reason monthly
budget is a dashboard query rather than a policy.

Error budget used is `(1 - availability) / (1 - SLO)` — divide by `0.01`
for FREE and `0.001` for PRO. `1.0` means the month is exhausted. Nothing
automates a deploy freeze when that happens; a human reads the chart.

### 5.4 Control-plane instrumentation (the SLO)

`apps/control-plane/src/lib/searchSli.ts` classifies the status.
`GET /organizations/:slug/search` sets `request.searchSli` immediately
after `resolveMembership`, before the Redis quota check, so a 429 is still
labeled. An `onResponse` hook in `apps/control-plane/src/app.ts` emits one
pino line when that field is set:

```json
{
  "msg": "search completed",
  "sli_operation": "search",
  "tenant_id": "<organization UUID>",
  "plan": "FREE",
  "latency_ms": 42,
  "http_status": 200,
  "sli_result": "good"
}
```

`msg` is `search completed` on purpose so this is not confused with
Fastify's generic access log. GKE parses stdout JSON into `jsonPayload`,
so Cloud Logging extracts `jsonPayload.sli_operation`,
`jsonPayload.tenant_id`, `jsonPayload.plan`, `jsonPayload.latency_ms`,
`jsonPayload.sli_result`. `latency_ms` is `Math.round(reply.elapsedTime)`
— the full handler time, which is what the tenant waited.

Documents/batch does not set `searchSli` and does not enter these metrics.

### 5.5 search-api instrumentation (the Meilisearch hop)

Unchanged from the earlier groundwork, and still required for the breakdown
chart. `requireTenantID` calls `logging.SetTenantID`; `RequestLogger` writes
numeric `latency_ms` next to `httpRequest.latency`:

```json
{
  "msg": "request completed",
  "tenant_id": "<organization UUID>",
  "latency_ms": 42,
  "httpRequest": { "requestUrl": "/internal/search?q=...", "status": 200, "latency": "42.1ms" }
}
```

The dashboard's "search-api p95" widget is this line, filtered to
`/internal/search` and HTTP 200. GKE promotes the `httpRequest` group to
`LogEntry.httpRequest`, so that filter uses `httpRequest.requestUrl` /
`httpRequest.status`, not `jsonPayload.httpRequest.*`. `latency_ms` stays
in `jsonPayload` and can be 0 for sub-millisecond searches. If
control-plane p95 is 400ms and search-api p95 is 40ms, the time is in
Fastify/Redis/auth, not Meilisearch.

### 5.6 Metrics, queries, dashboard

Terraform in `infra/monitoring/` (unapplied; log-based metrics are **not
retroactive** — apply metrics first, generate traffic, confirm series in
Metrics Explorer, then apply the dashboard):

| Resource | Type | Labels | What it is |
|---|---|---|---|
| `saas_search_requests` | DELTA INT64 | `tenant_id`, `plan`, `result` | one point per customer-facing search |
| `saas_search_latency_ms` | DELTA DISTRIBUTION (ms) | `tenant_id`, `plan` | good searches only; buckets on 300/800/2000 |
| `saas_search_api_latency_ms` | DELTA DISTRIBUTION (ms) | `tenant_id` | search-api `/internal/search` 200s |
| `saas-tenant-slas` dashboard | mosaic | — | availability, p95/p99, request count, excluded 4xx, 30d budget used, both latency hops |

Copy-paste MQL: `infra/monitoring/queries/tenant-sla.md`. The same queries
are embedded in `dashboard.tf`. After the first apply, confirm whether the
value column is `val()` or `value.<metric_name>` — MQL is opaque to
`terraform validate`.

Cardinality is `tenant_id × plan × pod`. That is acceptable at this
platform's org count. Do not add user, query, or request-id labels.

### 5.7 How a tenant breach surfaces

**Not** as an on-call page. A single tenant's SLO miss is "does this
account need an apology, a credit, or an upgrade conversation?" Paging
on it would train whoever is on call to ignore pages. Look at
`saas-tenant-slas`. A **global** miss (every tenant's p99 spikes, or
Meilisearch OOM) is already an infra incident via §1–§3.

## 6. Gaps we are accepting

- **The alerting Terraform is not applied.** Code review of this document
  does not close the 2026-08-18 paging hole.
- **No traces.** A slow search can be split into control-plane vs
  search-api via two p95 charts, not a waterfall.
- **No SLO on indexing, auth, or the web app** beyond the two uptime
  checks. Search is the product surface the original outage took down.
- **No automated error-budget policy.** Charts only.
- **Email-only pages**, and only after apply. Slack for deploys is
  optional and separate.
- **Orgs that never searched do not appear.** Listing every Postgres org,
  including zeroes, would be a control-plane page, not another metric.
- **`healthz` is not the search SLO.** Uptime can be green while a tenant's
  p95 is not, and the reverse is possible during a partial dependency
  failure that still serves some orgs.
