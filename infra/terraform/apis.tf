# Enable the Google APIs required by everything else in this module before
# provisioning any dependent resource (Artifact Registry, GKE, IAM, WIF).
resource "google_project_service" "required" {
  for_each = toset(var.required_apis)

  project = var.project_id
  service = each.value

  disable_dependent_services = false
  disable_on_destroy         = false
}
