terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "criticalmars-saas-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  service_name = "saas-api"
  db_name      = "fashiondb"
  labels = {
    application = "saas"
    environment = var.environment
    managed_by  = "terraform"
  }
}
