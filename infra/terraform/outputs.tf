output "cluster_name" {
  description = "Name of the provisioned GKE Autopilot cluster."
  value       = google_container_cluster.saas.name
}

output "cluster_location" {
  description = "Region the GKE cluster was provisioned in."
  value       = google_container_cluster.saas.location
}

output "cluster_endpoint" {
  description = "GKE cluster API endpoint (for kubeconfig / gcloud container clusters get-credentials)."
  value       = google_container_cluster.saas.endpoint
  sensitive   = true
}

output "artifact_registry_repository" {
  description = "Full Artifact Registry repository path, e.g. for `docker push`."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.saas.repository_id}"
}

output "deploy_service_account_email" {
  description = "Email of the least-privilege deploy service account. Set as the `service_account` input to google-github-actions/auth@v2 (e.g. repo variable GCP_DEPLOY_SA_EMAIL)."
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "Full resource name of the Workload Identity Pool Provider. Set as the `workload_identity_provider` input to google-github-actions/auth@v2 (e.g. repo variable GCP_WORKLOAD_IDENTITY_PROVIDER)."
  value       = google_iam_workload_identity_pool_provider.github_actions_oidc.name
}

output "ingress_static_ip_address" {
  description = "Reserved global static IP for the GKE ingress, if enabled."
  value       = var.reserve_ingress_static_ip ? google_compute_global_address.ingress[0].address : null
}

output "ingress_static_ip_name" {
  description = "Name of the reserved global static IP resource, for the kubernetes.io/ingress.global-static-ip-name annotation."
  value       = var.reserve_ingress_static_ip ? google_compute_global_address.ingress[0].name : null
}

output "catalog_bucket" {
  description = "Name of the private GCS bucket staging the preprocessed catalog + suggestions artifacts. Read via ADC/CI to seed the control-plane (see data/README.md)."
  value       = google_storage_bucket.saas.name
}

output "secret_manager_secret_ids" {
  description = "Secret Manager secret IDs (names, not values) created for the gke overlay's saas-secrets Kubernetes Secret. .github/workflows/deploy-gke.yml reads the latest version of each at deploy time."
  value       = { for k, s in google_secret_manager_secret.saas : k => s.secret_id }
}
