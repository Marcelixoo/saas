# This is a SEPARATE, standalone Terraform root from infra/terraform/ (its
# own state). It is deliberately decoupled so it can be applied, iterated
# on, or torn down without touching the cluster/network/secrets module that
# provisions the GKE cluster itself. Point it at the same project/region
# infra/terraform was applied against.

variable "project_id" {
  description = "GCP project ID the GKE cluster and its resources live in (same value as infra/terraform's project_id)."
  type        = string
  default     = "criticalmars-saas-505914"
}

variable "region" {
  description = "GCP region the GKE cluster lives in (same value as infra/terraform's region)."
  type        = string
  default     = "europe-west3"
}

variable "cluster_name" {
  description = "Name of the GKE Autopilot cluster to monitor (same value as infra/terraform's cluster_name)."
  type        = string
  default     = "saas-gke"
}

variable "namespace" {
  description = "Kubernetes namespace the saas workloads run in."
  type        = string
  default     = "saas"
}

variable "notification_email" {
  description = <<-EOT
    Email address that receives alert notifications (Cloud Monitoring email
    notification channel). Required — there is intentionally no default, so
    a `terraform plan`/`apply` fails loudly instead of silently paging
    nobody. Pass via -var, a *.auto.tfvars file (gitignored), or
    TF_VAR_notification_email.
  EOT
  type        = string
}

variable "web_uptime_host" {
  description = "Hostname (no scheme) for the web uptime check."
  type        = string
  default     = "web.criticalmars.me"
}

variable "api_uptime_host" {
  description = "Hostname (no scheme) for the control-plane API uptime check."
  type        = string
  default     = "api.criticalmars.me"
}

variable "api_uptime_path" {
  description = "Health check path on the control-plane API."
  type        = string
  default     = "/healthz"
}

variable "restart_count_threshold" {
  description = "Number of container restarts within the alignment window that trips the CrashLoopBackOff/restart alert."
  type        = number
  default     = 3
}

variable "memory_headroom_ratio_threshold" {
  description = <<-EOT
    Fraction (0-1) of a container's memory *limit* that its working-set
    usage must reach to trip the headroom-warning alert — i.e. an early
    warning before the kernel OOM-kills the container. 0.9 means "alert at
    90% of the limit".
  EOT
  type        = number
  default     = 0.9
}

variable "uptime_check_period_seconds" {
  description = "How often the uptime checks run, in seconds. Cloud Monitoring accepts 60, 300, 600, or 900."
  type        = number
  default     = 60
}

variable "alert_alignment_period_seconds" {
  description = "Alignment period (in seconds) used when aggregating the restart-count and memory-headroom metrics."
  type        = number
  default     = 300
}
