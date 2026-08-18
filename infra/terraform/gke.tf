# GKE Autopilot cluster. Autopilot is preferred over Standard here for
# production simplicity: node pool sizing, upgrades, and most security
# hardening (Shielded Nodes, Workload Identity, etc.) are managed by GCP.
resource "google_container_cluster" "saas" {
  provider = google-beta

  project  = var.project_id
  name     = var.cluster_name
  location = var.region

  enable_autopilot = true

  # Workload Identity is required by (and implied by) Autopilot, declared
  # explicitly for clarity — this is what lets in-cluster workloads use GCP
  # service accounts without a mounted key.
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  release_channel {
    channel = "REGULAR"
  }

  # Autopilot manages node pools itself; deleting the default node pool
  # setting is not applicable here (no google_container_node_pool needed).

  deletion_protection = true

  depends_on = [google_project_service.required]
}
