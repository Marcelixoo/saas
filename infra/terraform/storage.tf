# Private Cloud Storage bucket that stages the preprocessed product-catalog
# and search-suggestion artifacts produced by scripts/kaggle-preprocess.mjs
# (catalog/catalog.json + suggestions/suggestions.json).
#
# The bucket is PRIVATE — uniform bucket-level access plus enforced public
# access prevention. The running application pods do NOT read it at runtime
# (they have no GCP identity bound); instead an operator or CI reads the
# artifacts via Application Default Credentials and seeds them into the
# control-plane import API with scripts/import-catalog.mjs. See data/README.md.

resource "google_storage_bucket" "saas" {
  project  = var.project_id
  name     = var.catalog_bucket_name != "" ? var.catalog_bucket_name : "${var.project_id}-catalog"
  location = var.region

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Keep prior versions of the artifacts so a re-upload can be rolled back.
  versioning {
    enabled = true
  }

  depends_on = [google_project_service.required]
}

# The CI/CD deploy service account may read and write the catalog artifacts.
# Scoped to this bucket only — not a project-wide storage role.
resource "google_storage_bucket_iam_member" "deployer_catalog_object_admin" {
  bucket = google_storage_bucket.saas.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}
