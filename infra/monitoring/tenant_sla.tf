# Per-tenant search SLIs as log-based metrics. These are dashboard/support
# signals, not on-call pages — see docs/observability.md §5.4. Alert
# policies are intentionally omitted; a global outage already pages via
# alerts.tf / uptime.tf.
#
# Source logs:
#   control-plane  jsonPayload.sli_operation = "search"  (customer-facing SLI)
#   search-api     jsonPayload.msg = "request completed" on /internal/search
#                  (Meilisearch-hop breakdown; not the SLO itself)
#
# MQL for Metrics Explorer is in queries/tenant-sla.md. Paste those after
# this module is applied; log-based metrics only contain logs emitted
# *after* the metric exists.

# --- Customer-facing request counter --------------------------------------
#
# One point per resolved-tenant search. Label `result` is the SLI class
# (good | excluded | error) so availability is
#   sum(result == good) / sum(result == good || result == error)
# and 4xx (including quota 429s) can be charted without burning budget.

resource "google_logging_metric" "search_requests" {
  name        = "saas_search_requests"
  description = "Customer-facing search requests labeled by tenant, plan, and SLI result."
  filter      = <<-EOT
    resource.type = "k8s_container"
    resource.labels.cluster_name = "${var.cluster_name}"
    resource.labels.namespace_name = "${var.namespace}"
    resource.labels.container_name = "control-plane"
    jsonPayload.sli_operation = "search"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Organization UUID resolved by control-plane."
    }
    labels {
      key         = "plan"
      value_type  = "STRING"
      description = "Organization plan at request time (FREE or PRO)."
    }
    labels {
      key         = "result"
      value_type  = "STRING"
      description = "SLI class: good, excluded, or error."
    }
  }

  label_extractors = {
    tenant_id = "EXTRACT(jsonPayload.tenant_id)"
    plan      = "EXTRACT(jsonPayload.plan)"
    result    = "EXTRACT(jsonPayload.sli_result)"
  }
}

# --- Customer-facing latency distribution ---------------------------------
#
# Good searches only so a 502 does not distort p95. Bucket edges sit on the
# SLO cuts (300 / 800 / 2000 ms) so "fraction under threshold" is exact.

resource "google_logging_metric" "search_latency_ms" {
  name        = "saas_search_latency_ms"
  description = "Customer-facing search latency in milliseconds for successful (good) searches, labeled by tenant and plan."
  filter      = <<-EOT
    resource.type = "k8s_container"
    resource.labels.cluster_name = "${var.cluster_name}"
    resource.labels.namespace_name = "${var.namespace}"
    resource.labels.container_name = "control-plane"
    jsonPayload.sli_operation = "search"
    jsonPayload.sli_result = "good"
  EOT

  value_extractor = "EXTRACT(jsonPayload.latency_ms)"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Organization UUID resolved by control-plane."
    }
    labels {
      key         = "plan"
      value_type  = "STRING"
      description = "Organization plan at request time (FREE or PRO)."
    }
  }

  label_extractors = {
    tenant_id = "EXTRACT(jsonPayload.tenant_id)"
    plan      = "EXTRACT(jsonPayload.plan)"
  }

  bucket_options {
    explicit_buckets {
      bounds = [0, 50, 100, 150, 300, 500, 800, 1200, 2000, 5000, 10000]
    }
  }
}

# --- search-api hop (dependency breakdown, not the SLO) -------------------

resource "google_logging_metric" "search_api_latency_ms" {
  name        = "saas_search_api_latency_ms"
  description = "search-api /internal/search latency in milliseconds for HTTP 200, labeled by tenant."
  # GKE promotes slog's httpRequest group to LogEntry.httpRequest, so URL
  # and status are not under jsonPayload. latency_ms stays in jsonPayload
  # and can be 0 for sub-millisecond searches (duration.Milliseconds()).
  filter      = <<-EOT
    resource.type = "k8s_container"
    resource.labels.cluster_name = "${var.cluster_name}"
    resource.labels.namespace_name = "${var.namespace}"
    resource.labels.container_name = "search-api"
    jsonPayload.msg = "request completed"
    httpRequest.requestUrl =~ "^/internal/search(\\?|$)"
    httpRequest.status = 200
  EOT

  value_extractor = "EXTRACT(jsonPayload.latency_ms)"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Organization UUID from the trusted X-Tenant-ID header."
    }
  }

  label_extractors = {
    tenant_id = "EXTRACT(jsonPayload.tenant_id)"
  }

  bucket_options {
    explicit_buckets {
      bounds = [0, 50, 100, 150, 300, 500, 800, 1200, 2000, 5000, 10000]
    }
  }
}

# Shared MQL fragments used by dashboard.tf. Confirm `val()` vs
# `value.<metric_name>` in Metrics Explorer after the first apply — MQL
# is opaque to terraform validate.

locals {
  sla_resource_filter = "resource.cluster_name == '${var.cluster_name}' && resource.namespace_name == '${var.namespace}'"

  sla_availability_free_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_requests.name}'
    | filter ${local.sla_resource_filter}
            && metric.plan == 'FREE'
            && (metric.result == 'good' || metric.result == 'error')
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id, metric.result], [n: sum(val())]
    | group_by [metric.tenant_id],
        [availability: sum(if(metric.result == 'good', n, 0)) / sum(n)]
  EOT

  sla_availability_pro_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_requests.name}'
    | filter ${local.sla_resource_filter}
            && metric.plan == 'PRO'
            && (metric.result == 'good' || metric.result == 'error')
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id, metric.result], [n: sum(val())]
    | group_by [metric.tenant_id],
        [availability: sum(if(metric.result == 'good', n, 0)) / sum(n)]
  EOT

  sla_latency_p95_free_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_latency_ms.name}'
    | filter ${local.sla_resource_filter} && metric.plan == 'FREE'
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id], [p95: percentile(val(), 95)]
  EOT

  sla_latency_p99_free_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_latency_ms.name}'
    | filter ${local.sla_resource_filter} && metric.plan == 'FREE'
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id], [p99: percentile(val(), 99)]
  EOT

  sla_latency_p95_pro_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_latency_ms.name}'
    | filter ${local.sla_resource_filter} && metric.plan == 'PRO'
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id], [p95: percentile(val(), 95)]
  EOT

  sla_latency_p99_pro_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_latency_ms.name}'
    | filter ${local.sla_resource_filter} && metric.plan == 'PRO'
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id], [p99: percentile(val(), 99)]
  EOT

  sla_request_count_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_requests.name}'
    | filter ${local.sla_resource_filter}
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id, metric.plan], [n: sum(val())]
  EOT

  sla_excluded_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_requests.name}'
    | filter ${local.sla_resource_filter} && metric.result == 'excluded'
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id, metric.plan], [rejected: sum(val())]
  EOT

  sla_budget_free_30d = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_requests.name}'
    | filter ${local.sla_resource_filter}
            && metric.plan == 'FREE'
            && (metric.result == 'good' || metric.result == 'error')
    | align delta(30d)
    | every 30d
    | group_by [metric.tenant_id, metric.result], [n: sum(val())]
    | group_by [metric.tenant_id],
        [budget_used: (1 - sum(if(metric.result == 'good', n, 0)) / sum(n)) / 0.01]
  EOT

  sla_budget_pro_30d = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_requests.name}'
    | filter ${local.sla_resource_filter}
            && metric.plan == 'PRO'
            && (metric.result == 'good' || metric.result == 'error')
    | align delta(30d)
    | every 30d
    | group_by [metric.tenant_id, metric.result], [n: sum(val())]
    | group_by [metric.tenant_id],
        [budget_used: (1 - sum(if(metric.result == 'good', n, 0)) / sum(n)) / 0.001]
  EOT

  sla_search_api_p95_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_api_latency_ms.name}'
    | filter ${local.sla_resource_filter}
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id], [p95: percentile(val(), 95)]
  EOT

  sla_control_plane_p95_1h = <<-EOT
    fetch k8s_container
    | metric 'logging.googleapis.com/user/${google_logging_metric.search_latency_ms.name}'
    | filter ${local.sla_resource_filter}
    | align delta(1h)
    | every 1h
    | group_by [metric.tenant_id, metric.plan], [p95: percentile(val(), 95)]
  EOT
}
