terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Uncomment and configure a remote backend before running this against a
  # real environment shared by more than one operator. A local backend is
  # fine for a single-operator bootstrap but state will not be shared/locked.
  #
  # backend "gcs" {
  #   bucket = "<project_id>-terraform-state"
  #   prefix = "gke"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
