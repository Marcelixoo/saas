# Fashion Catalog System - GCP Infrastructure
#
# This Terraform configuration manages the infrastructure for a multi-tenant
# SaaS fashion catalog system deployed on Google Cloud Platform, including:
# - Cloud Run service for the API
# - Cloud SQL PostgreSQL database
# - VPC networking and connectors
# - Secret Manager for sensitive configuration
# - Artifact Registry for container images
#
# The infrastructure uses GCS backend for state management and supports
# multiple environments (dev, staging, production) through variables.

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

    # Note: Ensure this bucket exists before running terraform init
    # Create it using: scripts/setup-gcp.sh <project-id>
    # The bucket should have:
    # - Versioning enabled for state history
    # - Appropriate IAM permissions for terraform service account
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
