# Workload Identity Federation for GitHub Actions: lets CI authenticate as
# the deploy service account below via a short-lived OIDC token issued by
# GitHub, with NO long-lived JSON key ever created or stored as a secret.

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = var.deploy_service_account_id
  display_name = "GKE CD deploy service account (GitHub Actions, WIF)"
  description  = "Least-privilege identity used by .github/workflows/deploy-gke.yml to push images and deploy manifests. Never issued a long-lived key."

  depends_on = [google_project_service.required]
}

# Least-privilege roles: push/pull images, and act as a GKE "developer"
# (deploy workloads, read cluster config) — no cluster-admin, no
# project-level owner/editor.
resource "google_project_iam_member" "deployer_artifact_registry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_container_developer" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github_actions" {
  project                   = var.project_id
  workload_identity_pool_id = var.workload_identity_pool_id
  display_name              = "GitHub Actions"
  description               = "Identity pool federating GitHub Actions OIDC tokens for CD."

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github_actions_oidc" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions.workload_identity_pool_id
  workload_identity_pool_provider_id = var.workload_identity_pool_provider_id
  display_name                       = "GitHub OIDC"
  description                        = "OIDC provider trusting tokens issued by GitHub Actions for ${var.github_repository}."

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Restrict to this exact repository so no other GitHub repo can mint
  # tokens usable against this pool.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow the GitHub Actions OIDC identity (scoped to this repo) to impersonate
# the deploy service account — this is what removes the need for a
# long-lived JSON key in GitHub secrets.
resource "google_service_account_iam_member" "deployer_workload_identity_user" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions.name}/attribute.repository/${var.github_repository}"
}
