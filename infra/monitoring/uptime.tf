# Black-box uptime checks against the two publicly-exposed hostnames
# (CONTRACT.md §1: web + control-plane are the only public services). These
# catch "the whole API/UI is down" directly and independently of whatever
# caused it — including failure modes the pod-health alerts in alerts.tf
# don't cover (DNS, ingress/load-balancer misconfig, managed-cert expiry).

resource "google_monitoring_uptime_check_config" "web" {
  display_name = "saas-web-uptime"
  timeout      = "10s"
  period       = "${var.uptime_check_period_seconds}s"

  http_check {
    path           = "/"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.web_uptime_host
    }
  }
}

resource "google_monitoring_uptime_check_config" "api_healthz" {
  display_name = "saas-api-healthz-uptime"
  timeout      = "10s"
  period       = "${var.uptime_check_period_seconds}s"

  http_check {
    path           = var.api_uptime_path
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.api_uptime_host
    }
  }
}

# Alert when either uptime check's success rate drops to zero across all
# checker regions for two consecutive checks — i.e. it's actually down, not
# a single flaky region.
resource "google_monitoring_alert_policy" "web_uptime_failure" {
  display_name = "saas-web-down"
  combiner     = "OR"
  documentation {
    content   = "web.criticalmars.me is failing its uptime check from multiple regions. Check `kubectl -n ${var.namespace} get pods -l app=web` and the ingress/managed-certificate status first."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Web uptime check failing"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id = \"${google_monitoring_uptime_check_config.web.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "120s"
      aggregations {
        alignment_period     = "120s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "api_uptime_failure" {
  display_name = "saas-api-down"
  combiner     = "OR"
  documentation {
    content   = "api.criticalmars.me/healthz is failing its uptime check from multiple regions. This is the same class of failure as the 2026-08-18 Meilisearch OOM outage (control-plane blocked on a downstream init container). Check `kubectl -n ${var.namespace} get pods` for CrashLoopBackOff/OOMKilled across control-plane, search-api, and meilisearch."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "API healthz uptime check failing"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id = \"${google_monitoring_uptime_check_config.api_healthz.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "120s"
      aggregations {
        alignment_period     = "120s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}
