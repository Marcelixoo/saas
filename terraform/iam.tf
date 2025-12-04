resource "google_service_account" "cloud_run" {
  account_id   = "${local.service_name}-sa"
  display_name = "Service Account for ${local.service_name}"
  description  = "Used by Cloud Run service to access GCP resources"
}


locals {
  cloud_run_roles = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter"
  ])
}


resource "google_project_iam_member" "cloud_run_roles" {
  for_each = local.cloud_run_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}
