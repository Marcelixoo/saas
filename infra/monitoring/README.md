# infra/monitoring

Standalone Terraform root that provisions Cloud Monitoring alerting for the
`saas-gke` cluster: an email notification channel, uptime checks on the two
public hostnames, and alert policies for the pod-health incident class that
caused the 2026-08-18 outage (`meilisearch-0` OOM-looping at its old 512Mi
limit with nothing alerting anyone).

See `docs/observability.md` at the repo root for the design rationale.

## Status: NOT APPLIED

This module has been written and validated (`terraform validate`, `terraform
fmt`) but **never applied**. Nothing here has touched the live `saas-gke`
project. Review the alert thresholds in `variables.tf` (especially
`memory_headroom_ratio_threshold` and `restart_count_threshold`) before
applying.

## Why a separate root from `infra/terraform/`

This module is decoupled from the cluster-provisioning root so it can be
iterated on, applied, or torn down independently — alert policy changes are
zero-risk to the running cluster, whereas `infra/terraform/` changes touch
the GKE cluster/network/IAM itself. Both target the same project/region.

## Apply

```sh
cd infra/monitoring
cp terraform.tfvars.example terraform.tfvars   # fill in notification_email
terraform init
terraform plan
terraform apply
```

## What this does NOT do

- No Slack/PagerDuty channel — email only. `notifications.tf` has a
  commented-out example for adding a Slack webhook channel.
- No per-tenant alerting. Per-tenant SLA measurement is a logs-based /
  dashboard concern layered on top of the `latency_ms` + `tenant_id`
  structured log fields already emitted by search-api (see
  `docs/observability.md` §5) — it isn't expressed as Terraform alert
  policies here because a *global* SLA breach should already page via the
  policies in this module; a *single tenant's* SLA breach is a
  business/support signal, not an on-call page (see the design doc for the
  reasoning and the concrete follow-up if that changes).
- No dashboards. Cloud Monitoring auto-generates a default dashboard per
  GKE workload; a curated one is a natural next step once these alerts have
  been live for a while.
