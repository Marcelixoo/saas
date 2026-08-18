# Pod-health alerting for the incident class that caused the 2026-08-18
# outage: meilisearch-0 OOM-looped (exit 137 at its old 512Mi limit) and
# nothing alerted — the failure was only noticed when a human hit the UI.
# These three policies close that gap:
#   1. container restart count rising (CrashLoopBackOff and friends)
#   2. an actual OOMKilled event, straight from the source of truth
#   3. memory working-set approaching a container's limit, i.e. a warning
#      *before* the kernel OOM-kills anything
#
# All three fire independently of the uptime checks in uptime.tf, so a
# single-replica StatefulSet like meilisearch that dies without ever taking
# the whole ingress path down still pages someone.

# --- 1. Container restart count -------------------------------------------
#
# kubernetes.io/container/restart_count is a CUMULATIVE metric exported by
# GKE for every container. Aligning with ALIGN_DELTA over the window turns
# it into "restarts within this window", which is what we actually want to
# threshold on (the raw cumulative value only ever goes up).
resource "google_monitoring_alert_policy" "container_restarts" {
  display_name = "saas-container-restarting"
  combiner     = "OR"
  documentation {
    content   = "A container in namespace `${var.namespace}` has restarted ${var.restart_count_threshold}+ times in the last ${var.alert_alignment_period_seconds}s (CrashLoopBackOff or similar). Run `kubectl -n ${var.namespace} get pods` and `kubectl -n ${var.namespace} describe pod <name>` to see the last termination reason."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Container restart count rising"
    condition_threshold {
      filter          = <<-EOT
        resource.type = "k8s_container"
        AND resource.label.cluster_name = "${var.cluster_name}"
        AND resource.label.namespace_name = "${var.namespace}"
        AND metric.type = "kubernetes.io/container/restart_count"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = var.restart_count_threshold
      duration        = "0s"
      aggregations {
        alignment_period     = "${var.alert_alignment_period_seconds}s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.label.pod_name", "resource.label.container_name"]
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "3600s"
  }
}

# --- 2. OOMKilled events -----------------------------------------------
#
# GKE emits a Kubernetes Event with reason "OOMKilling" (node-level cgroup
# OOM kill) into Cloud Logging. A log-based metric turns matching log
# entries into a counter Cloud Monitoring can alert on directly — this
# catches the exact failure mode from the outage (exit 137) with no
# ambiguity, independent of the restart-count heuristic above.
resource "google_logging_metric" "oom_killed_events" {
  name   = "saas_oom_killed_events"
  filter = <<-EOT
    resource.type = "k8s_pod"
    resource.labels.cluster_name = "${var.cluster_name}"
    resource.labels.namespace_name = "${var.namespace}"
    jsonPayload.reason = "OOMKilling"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_monitoring_alert_policy" "oom_killed" {
  display_name = "saas-oom-killed"
  combiner     = "OR"
  documentation {
    content   = "The kernel OOM-killed a container in namespace `${var.namespace}` (this is exactly what happened to meilisearch-0 during the 2026-08-18 outage). Check current memory limits in infra/k8s/overlays/gke/production-patch.yaml against actual usage before just raising the limit again."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "OOMKilling event logged"
    condition_threshold {
      filter          = "resource.type = \"k8s_pod\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.oom_killed_events.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_COUNT"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "3600s"
  }
}

# --- 3. Memory headroom (early warning before OOM) -------------------------
#
# Ratio of a container's memory working set to its configured limit. MQL is
# used (rather than a plain condition_threshold filter) because the ratio
# has to be computed from two separate metrics — used_bytes and
# limit_bytes — which a single classic filter can't express.
#
# NOTE for the reviewer applying this: MQL syntax isn't checked by
# `terraform validate` (it's an opaque string to Terraform, only parsed by
# the Monitoring API at apply/create time). Paste the query below into
# Cloud Console -> Monitoring -> Metrics Explorer -> MQL tab against the
# real project first and confirm it returns a 0-1 ratio series before
# applying this policy.
resource "google_monitoring_alert_policy" "memory_headroom" {
  display_name = "saas-memory-approaching-limit"
  combiner     = "OR"
  documentation {
    content   = "A container in namespace `${var.namespace}` is using ${var.memory_headroom_ratio_threshold * 100}%+ of its memory limit. This is a leading indicator — act before the next alert is an OOMKilled event. Either the workload needs more headroom (see infra/k8s/overlays/gke/production-patch.yaml) or there's a leak/regression to investigate first."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Working set / memory limit ratio high"
    condition_monitoring_query_language {
      duration = "300s"
      query    = <<-EOT
        { fetch k8s_container
          | metric 'kubernetes.io/container/memory/used_bytes'
          | filter (resource.cluster_name == '${var.cluster_name}' && resource.namespace_name == '${var.namespace}')
          | group_by [resource.pod_name, resource.container_name], ${var.alert_alignment_period_seconds}s, [value_used_bytes_mean: mean(value.used_bytes)]
        ; fetch k8s_container
          | metric 'kubernetes.io/container/memory/limit_bytes'
          | filter (resource.cluster_name == '${var.cluster_name}' && resource.namespace_name == '${var.namespace}')
          | group_by [resource.pod_name, resource.container_name], ${var.alert_alignment_period_seconds}s, [value_limit_bytes_mean: mean(value.limit_bytes)]
        }
        | join
        | value [ratio: val(0) / val(1)]
        | condition ratio > ${var.memory_headroom_ratio_threshold}
      EOT
      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "3600s"
  }
}
