terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Uncomment and configure a remote backend before running this against a
  # real environment shared by more than one operator — mirrors the note in
  # infra/terraform/versions.tf. A local backend is fine for a single
  # operator bootstrap but state will not be shared/locked.
  #
  # backend "gcs" {
  #   bucket = "<project_id>-terraform-state"
  #   prefix = "monitoring"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
