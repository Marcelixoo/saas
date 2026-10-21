# Per-tenant search SLI queries

Paste into Cloud Console → Monitoring → Metrics Explorer → MQL after
`infra/monitoring` is applied. Log-based metrics only include logs emitted
**after** the metric resource exists.

Confirm the value column (`val()` vs `value.saas_search_requests`) against
the first real series. Replace `saas` / `saas-gke` if those variables differ.

Customer-facing SLI is control-plane `GET /organizations/:slug/search`.
`good` = 2xx/3xx, `excluded` = 4xx (including quota 429), `error` = 5xx.
A tenant with no `good`/`error` samples in the window is omitted.

## Availability (1h)

```
fetch k8s_container
| metric 'logging.googleapis.com/user/saas_search_requests'
| filter resource.namespace_name == 'saas'
        && (metric.result == 'good' || metric.result == 'error')
| align delta(1h)
| every 1h
| group_by [metric.tenant_id, metric.plan, metric.result], [n: sum(val())]
| group_by [metric.tenant_id, metric.plan],
    [availability: sum(if(metric.result == 'good', n, 0)) / sum(n)]
```

For the monthly widget, change both `1h` intervals to `30d`. Filter
`metric.plan == 'FREE'` or `'PRO'` to overlay the matching SLO line
(0.99 / 0.999).

## Latency p95 / p99 (1h)

```
fetch k8s_container
| metric 'logging.googleapis.com/user/saas_search_latency_ms'
| filter resource.namespace_name == 'saas'
| align delta(1h)
| every 1h
| group_by [metric.tenant_id, metric.plan],
    [p95: percentile(val(), 95), p99: percentile(val(), 99), n: count(val())]
```

FREE targets: p95 < 800ms, p99 < 2000ms. PRO: p95 < 300ms, p99 < 800ms.

## Error budget used (30d)

`(1 - availability) / (1 - SLO)`. `1.0` means the month's budget is gone.
Swap `0.001` → `0.01` and `PRO` → `FREE` for the other tier.

```
fetch k8s_container
| metric 'logging.googleapis.com/user/saas_search_requests'
| filter resource.namespace_name == 'saas'
        && metric.plan == 'PRO'
        && (metric.result == 'good' || metric.result == 'error')
| align delta(30d)
| every 30d
| group_by [metric.tenant_id, metric.result], [n: sum(val())]
| group_by [metric.tenant_id],
    [budget_used: (1 - sum(if(metric.result == 'good', n, 0)) / sum(n)) / 0.001,
     requests: sum(n)]
```

## Quota / 4xx volume (not in the SLO)

```
fetch k8s_container
| metric 'logging.googleapis.com/user/saas_search_requests'
| filter resource.namespace_name == 'saas' && metric.result == 'excluded'
| align delta(1h)
| every 1h
| group_by [metric.tenant_id, metric.plan], [rejected: sum(val())]
```

## search-api hop p95

```
fetch k8s_container
| metric 'logging.googleapis.com/user/saas_search_api_latency_ms'
| filter resource.namespace_name == 'saas'
| align delta(1h)
| every 1h
| group_by [metric.tenant_id], [p95: percentile(val(), 95)]
```
