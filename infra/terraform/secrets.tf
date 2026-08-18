# GCP Secret Manager as the source of truth for the gke overlay's
# `saas-secrets` Kubernetes Secret. Values here are generated once by
# Terraform and stored only in Secret Manager (versioned/audited/
# IAM-controlled) and Terraform state (already git-excluded) — never in
# git. `.github/workflows/deploy-gke.yml` reads the latest version of each
# secret at deploy time and materializes them into the cluster as a native
# k8s Secret named `saas-secrets`, satisfying the Deployments' existing
# `secretKeyRef` references without an operator ever handling raw values.

resource "random_password" "jwt_secret" {
  length  = 32
  special = true
}

resource "random_password" "jwt_secret_key" {
  length  = 32
  special = true
}

resource "random_password" "meili_key" {
  length  = 32
  special = true
}

resource "random_password" "postgres_password" {
  length  = 32
  special = true
}

locals {
  # Keys as they must appear in the saas-secrets k8s Secret (stringData
  # keys), mapped to their values. Kept in one map so the secret resources
  # below can be declared with for_each instead of repeating boilerplate
  # per key.
  secret_values = {
    POSTGRES_USER       = "saas"
    POSTGRES_PASSWORD   = random_password.postgres_password.result
    DATABASE_URL        = "postgresql://saas:${random_password.postgres_password.result}@postgres:5432/saas"
    JWT_SECRET          = random_password.jwt_secret.result
    JWT_SECRET_KEY      = random_password.jwt_secret_key.result
    MEILISEARCH_API_KEY = random_password.meili_key.result
  }
}

resource "google_secret_manager_secret" "saas" {
  for_each = local.secret_values

  project   = var.project_id
  secret_id = "${var.secret_name_prefix}-${each.key}"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "saas" {
  for_each = local.secret_values

  secret      = google_secret_manager_secret.saas[each.key].id
  secret_data = each.value
}

# Least-privilege read access for the CD deploy service account — it needs
# to read these specific secrets' latest versions at deploy time to
# materialize the saas-secrets k8s Secret, nothing broader.
resource "google_secret_manager_secret_iam_member" "deployer_accessor" {
  for_each = local.secret_values

  project   = var.project_id
  secret_id = google_secret_manager_secret.saas[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}
