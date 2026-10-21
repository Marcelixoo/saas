# infra/monitoring

Standalone Terraform root that provisions Cloud Monitoring for the
`saas-gke` cluster: an email notification channel, uptime checks on the two
public hostnames, alert policies for the pod-health incident class that
caused the 2026-08-18 outage (`meilisearch-0` OOM-looping at its old 512Mi
limit with nothing alerting anyone), and the log-based metrics plus
`saas-tenant-slas` dashboard for per-tenant search SLOs.

See `docs/observability.md` for the strategy (including what is still
unapplied) and `queries/tenant-sla.md` for copy-paste MQL.

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

## Apply order for the SLA metrics

Log-based metrics are not retroactive. After control-plane is emitting
`sli_operation=search` lines in prod:

1. Apply this module (or apply just the `google_logging_metric` resources).
2. Hit search once per plan and confirm series in Metrics Explorer
   (`queries/tenant-sla.md`). Confirm `val()` vs `value.<metric_name>`.
3. If the dashboard was applied in the same run and the widgets are empty,
   that is expected until traffic lands *after* the metrics exist; refresh
   once series appear.

## What this does NOT do

- No Slack/PagerDuty channel — email only. `notifications.tf` has a
  commented-out example for adding a Slack webhook channel.
- No per-tenant **alert policies**. A global outage pages via the policies
  in this module; a single tenant's SLO miss is the `saas-tenant-slas`
  dashboard (support/business), not an infra page. See
  `docs/observability.md` §5.
- No traces, Prometheus, or OpenTelemetry. GKE logs + log-based metrics
  only.
