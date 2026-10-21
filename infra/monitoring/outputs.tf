output "notification_channel_id" {
  description = "ID of the email notification channel every alert policy in this module notifies."
  value       = google_monitoring_notification_channel.email.id
}

output "alert_policy_ids" {
  description = "IDs of every alert policy created by this module, for quick reference."
  value = {
    web_uptime_failure = google_monitoring_alert_policy.web_uptime_failure.id
    api_uptime_failure = google_monitoring_alert_policy.api_uptime_failure.id
    container_restarts = google_monitoring_alert_policy.container_restarts.id
    oom_killed         = google_monitoring_alert_policy.oom_killed.id
    memory_headroom    = google_monitoring_alert_policy.memory_headroom.id
  }
}

output "sla_metric_names" {
  description = "Log-based metric names for per-tenant search SLIs (dashboard/support, not on-call)."
  value = {
    search_requests       = google_logging_metric.search_requests.name
    search_latency_ms     = google_logging_metric.search_latency_ms.name
    search_api_latency_ms = google_logging_metric.search_api_latency_ms.name
  }
}

output "tenant_sla_dashboard_id" {
  description = "ID of the saas-tenant-slas Cloud Monitoring dashboard."
  value       = google_monitoring_dashboard.tenant_slas.id
}
