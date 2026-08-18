# `infra/terraform` — GKE provisioning

Reproducible Terraform for a production GKE environment for this platform:
a GKE **Autopilot** cluster, an Artifact Registry Docker repository, a
least-privilege deploy service account federated to GitHub Actions via
**Workload Identity Federation (WIF)** (no long-lived JSON keys), and an
optional reserved static IP for the ingress.

This module only provisions cloud infrastructure. It does not deploy the
application — that's `.github/workflows/deploy-gke.yml`, which builds
images, pushes them to the Artifact Registry repo created here, and runs
`kubectl apply -k infra/k8s/overlays/gke`.

## What gets created

| Resource | File | Purpose |
|---|---|---|
| API enablement | `apis.tf` | `container`, `artifactregistry`, `compute`, `iam`, `iamcredentials`, `serviceusage`, `cloudresourcemanager`, `sts` |
| Artifact Registry repo | `artifact_registry.tf` | Docker repo (default name `saas`) for web/control-plane/search-api images |
| GKE Autopilot cluster | `gke.tf` | Regional Autopilot cluster with Workload Identity enabled |
| Deploy service account | `wif.tf` | `roles/artifactregistry.writer` + `roles/container.developer` only |
| Workload Identity Pool + Provider | `wif.tf` | OIDC trust restricted to `github_repository` (default `Marcelixoo/saas`) |
| Global static IP (optional) | `networking.tf` | For a GCE-class ingress with a stable IP; toggle with `reserve_ingress_static_ip` |

Parameterized via variables (see `variables.tf` / `terraform.tfvars.example`):
`project_id` (default `criticalmars-saas`), `region` (default
`europe-west3`), and naming for the repo/cluster/service account/WIF pool.

## Prerequisites

- Terraform >= 1.5.
- A GCP project with billing enabled (default assumed: `criticalmars-saas`).
- An operator principal (your own `gcloud auth application-default login`
  identity, or a bootstrap service account) with, at minimum, these IAM
  roles on the project for the *first* `apply` (Terraform needs to create
  IAM bindings, enable APIs, and create the cluster/service account):
  - `roles/owner`, **or** the narrower combination:
    `roles/serviceusage.serviceUsageAdmin`,
    `roles/artifactregistry.admin`,
    `roles/container.admin`,
    `roles/iam.serviceAccountAdmin`,
    `roles/iam.workloadIdentityPoolAdmin`,
    `roles/resourcemanager.projectIamAdmin`,
    `roles/compute.networkAdmin` (only needed if `reserve_ingress_static_ip = true`).
- `gcloud auth application-default login` (or `GOOGLE_APPLICATION_CREDENTIALS`
  pointing at a bootstrap key) so the `google`/`google-beta` providers can
  authenticate. This one-time bootstrap credential is the *only* place a
  long-lived credential is needed — CI itself never gets one (see WIF below).

## Usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars if you're not using the criticalmars-saas defaults

terraform init
terraform plan -out=tfplan
terraform apply tfplan

terraform output
```

By default this uses local state (no `backend` block). For anything beyond a
single-operator bootstrap, uncomment the `backend "gcs" { ... }` block in
`versions.tf` and point it at a pre-created state bucket
(`gsutil mb -l <region> gs://<project_id>-terraform-state && gsutil versioning set on gs://<project_id>-terraform-state`),
then re-run `terraform init` to migrate state.

## Wiring the outputs into CI

After `terraform apply`, configure these in the GitHub repo
(`Marcelixoo/saas` → Settings → Secrets and variables → Actions →
**Variables**, since neither value is a secret — WIF is the whole point of
not needing one):

| GitHub repo variable | Terraform output |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `workload_identity_provider` |
| `GCP_SERVICE_ACCOUNT` | `deploy_service_account_email` |
| `GCP_PROJECT_ID` | `var.project_id` (i.e. whatever you set, default `criticalmars-saas`) |
| `GCP_REGION` | `var.region` (default `europe-west3`) |
| `GCP_ARTIFACT_REGISTRY` | `artifact_registry_repository` output (or derive as `<region>-docker.pkg.dev`) |

`.github/workflows/deploy-gke.yml` reads these as repo variables
(`vars.*`) and is written to **skip** (not fail) the deploy job when they
are absent, so it's safe to merge before running `terraform apply` for the
first time.

## Validation

- `terraform fmt -recursive` — run and clean.
- `terraform validate` — requires the `terraform` CLI. If it isn't
  installed in your environment, at minimum confirm `terraform fmt -check`
  passes and review the plan carefully before the first `apply`.

## Notes / production alternatives

- **GKE Autopilot vs Standard.** Autopilot is used here for operational
  simplicity (GCP manages node pools, upgrades, most hardening). If you
  need node-level control (custom machine types, GPUs, DaemonSets that
  Autopilot restricts), switch to a `google_container_cluster` +
  `google_container_node_pool` (Standard) pair instead — the rest of this
  module (Artifact Registry, WIF, deploy SA) is unaffected either way.
- **In-cluster stateful services vs managed.** `infra/k8s/base` runs
  Postgres, Redis, and Meilisearch in-cluster (StatefulSets/PVCs) for
  parity with the local k3d topology. For a real production rollout,
  consider **Cloud SQL for PostgreSQL** and **Memorystore for Redis**
  instead — this Terraform module does not provision them, since keeping
  the in-cluster topology identical between local/dev and prod is a
  reasonable and deliberate trade-off for now. Adding them later is
  additive (new `.tf` files + updating `DATABASE_URL`/`REDIS_URL` in the
  `gke` k8s overlay) and does not require re-architecting this module.
- **Secrets.** This module does not create any GCP Secret Manager secrets
  or Kubernetes secrets. Production secret handling for the GKE overlay
  (`infra/k8s/overlays/gke`) and the CD pipeline are covered in a
  follow-up PR and documented in `infra/README.md` once merged.
