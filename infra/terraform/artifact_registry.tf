resource "google_artifact_registry_repository" "saas" {
  provider = google-beta

  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repository_id
  description   = "Docker images for the saas platform (web, control-plane, search-api)."
  format        = "DOCKER"

  depends_on = [google_project_service.required]
}
