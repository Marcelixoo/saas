variable "project_id" {
  description = "GCP project ID to provision resources in."
  type        = string
  default     = "criticalmars-saas"
}

variable "region" {
  description = "GCP region for the GKE cluster, Artifact Registry repo, and static IP."
  type        = string
  default     = "europe-west3"
}

variable "artifact_registry_repository_id" {
  description = "Name of the Artifact Registry Docker repository."
  type        = string
  default     = "saas"
}

variable "cluster_name" {
  description = "Name of the GKE Autopilot cluster."
  type        = string
  default     = "saas-gke"
}

variable "deploy_service_account_id" {
  description = "Account ID (local part, before @project.iam.gserviceaccount.com) of the least-privilege deploy service account used by CI."
  type        = string
  default     = "saas-gke-deployer"
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy service account via Workload Identity Federation, in \"owner/repo\" form."
  type        = string
  default     = "Marcelixoo/saas"
}

variable "workload_identity_pool_id" {
  description = "ID of the Workload Identity Pool created for GitHub Actions."
  type        = string
  default     = "github-actions-pool"
}

variable "workload_identity_pool_provider_id" {
  description = "ID of the Workload Identity Pool Provider (OIDC) created for GitHub Actions."
  type        = string
  default     = "github-actions-oidc"
}

variable "reserve_ingress_static_ip" {
  description = "Whether to reserve a global static IP for use by the GKE ingress (GCE Ingress class). Optional — set to false if you don't plan to pin a static IP to the ingress yet."
  type        = bool
  default     = true
}

variable "ingress_static_ip_name" {
  description = "Name of the reserved global static IP address for ingress."
  type        = string
  default     = "saas-ingress-ip"
}

variable "required_apis" {
  description = "Google APIs to enable on the project before provisioning other resources."
  type        = list(string)
  default = [
    "container.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "sts.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
  ]
}

variable "catalog_bucket_name" {
  description = "Name of the private GCS bucket that stages the preprocessed product catalog + search-suggestion artifacts (see data/README.md). GCS bucket names are globally unique; leave empty to derive \"<project_id>-catalog\"."
  type        = string
  default     = ""
}

variable "secret_name_prefix" {
  description = "Prefix used when naming the GCP Secret Manager secrets created for the gke overlay's saas-secrets Kubernetes Secret (e.g. \"saas\" -> \"saas-JWT_SECRET\")."
  type        = string
  default     = "saas"
}
