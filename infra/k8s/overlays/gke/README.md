# `infra/k8s/overlays/gke` — production overlay

Deployed by `.github/workflows/deploy-gke.yml` against the cluster
provisioned by `infra/terraform/`. `kubectl kustomize infra/k8s/overlays/gke`
builds cleanly with no live cluster or secrets — this doc covers what's
additionally needed to `apply` it for real.

## What this overlay changes vs. base

| File | Change |
|---|---|
| `secret-delete-patch.yaml` | Deletes the base's dev-placeholder `saas-secrets` Secret entirely (does **not** ship it). |
| `secret.example.yaml` | Template for the real Secret — copy, fill in, `kubectl apply -f` out-of-band. Not referenced by `kustomization.yaml`. |
| `production-patch.yaml` | `web`/`control-plane`/`search-api` to 2 replicas; bumps resource requests/limits for `control-plane`/`search-api`. |
| `ingress-patch.yaml` | GCE ingress class, reserved static IP annotation, GKE-managed cert, HTTPS-redirect FrontendConfig. Placeholder hostnames — **must** be replaced. |
| `managed-certificate.yaml` | `ManagedCertificate` for the two ingress hostnames. Placeholder domains — **must** be replaced. |
| `frontend-config.yaml` | Forces HTTP → HTTPS redirect on the ingress. |
| `kustomization.yaml` `images:` | Placeholder `newName`/`newTag` — the CD workflow overwrites these on every deploy via `kustomize edit set image`; a manual `kubectl apply -k` without going through CI will visibly fail to pull `REPLACE_WITH_...` images (deliberate — no silent stale/wrong image). |

`postgres`, `redis`, and `meilisearch` are left as the base's single-replica
StatefulSet/Deployment config — see "Managed alternatives" below.

## Before the first real deploy

1. **Provision infrastructure:** `terraform apply` in `infra/terraform/`
   (creates the cluster, Artifact Registry repo, deploy service account +
   WIF, and reserves the `saas-ingress-ip` static IP this overlay's
   ingress annotation references).
2. **Supply real secrets** (never committed):
   ```bash
   cp infra/k8s/overlays/gke/secret.example.yaml /tmp/saas-secrets.yaml
   # edit /tmp/saas-secrets.yaml with real, strong, unique values
   kubectl apply -f /tmp/saas-secrets.yaml
   ```
   Recommended production path instead: GCP Secret Manager + the
   [Secret Manager CSI driver](https://secrets-store-csi-driver.sigs.k8s.io/)
   (see the comment block in `secret.example.yaml`) so secrets are
   versioned/audited/IAM-controlled instead of a plain Secret an operator
   applies by hand.
3. **Point DNS at the reserved static IP** (`terraform output
   ingress_static_ip_address`) for your two real hostnames, then replace
   the placeholder `web.YOUR_DOMAIN.example` / `api.YOUR_DOMAIN.example`
   values in both `ingress-patch.yaml` and `managed-certificate.yaml` with
   them. GKE only issues the managed cert once the domains resolve to the
   ingress IP — this can take a few minutes after the Ingress is created.
4. **Configure GitHub repo variables** for the CD workflow — see
   `infra/terraform/README.md`'s "Wiring the outputs into CI" table
   (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`,
   `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_ARTIFACT_REGISTRY`,
   `GCP_CLUSTER_NAME`, `PROD_API_URL`).

Once all four are done, a push to `main` (or a `v*` tag) runs
`.github/workflows/deploy-gke.yml`, which builds+pushes all three images,
sets them in this overlay via `kustomize edit set image`, and
`kubectl apply -k`s it.

## Managed alternatives for stateful services

This overlay keeps Postgres/Redis/Meilisearch in-cluster for parity with
the local k3d topology (same manifests, same trust boundary — nothing in
`infra/k8s/base` differs between environments). For a real production
rollout you may prefer:

- **Cloud SQL for PostgreSQL** instead of the in-cluster `postgres`
  StatefulSet — managed backups, HA, no PVC-loss risk. Would require
  swapping `DATABASE_URL` in the real Secret to a Cloud SQL connection
  string (via the Cloud SQL Auth Proxy sidecar or private IP) and removing
  the `postgres.yaml` resource from this overlay.
- **Memorystore for Redis** instead of the in-cluster `redis` Deployment —
  similar trade-off; `redis` here only backs rate-limit counters, so this
  is lower priority than Postgres.
- Meilisearch has no first-party GCP-managed equivalent; keeping it
  in-cluster (with its existing PVC) is the practical choice either way.

Neither is provisioned by `infra/terraform/` today — this is called out as
a documented option, not a requirement, since the in-cluster topology is a
reasonable and already-verified trade-off (see the local k3d overlay).

## Known limitations

- Not yet applied to any real GKE cluster by this change — manifests-only,
  validated with `kubectl kustomize` (offline, no live GCP credentials
  used or required).
- No HPA (HorizontalPodAutoscaler) configured; replicas are static.
- No PodDisruptionBudget; acceptable at 2 replicas for now but worth adding
  before treating this as a hard production SLA target.
