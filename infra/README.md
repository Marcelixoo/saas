# Kubernetes runtime (Agent E)

Deploys the full platform (per `CONTRACT.md` §1) to a local **k3d** cluster
using Kustomize. Owns `infra/**` only.

```
infra/
  k8s/
    base/                 # namespace, configmap, secret, all workloads+services, ingress
    overlays/local/       # k3d: acceptance-tuned config, localtest.me ingress hosts, dev secrets
    overlays/gke/         # production overlay — see "Production (GKE)" below
  docker/
    control-plane.Dockerfile   # same as apps/control-plane/Dockerfile + optional CA trust
    web.Dockerfile              # same as apps/web/Dockerfile, bakes NEXT_PUBLIC_API_URL at build time
    search-api.Dockerfile       # same as root Dockerfile, builds with `-mod=vendor`
    certs/                      # optional corporate CA certs for building behind a TLS proxy (gitignored)
```

## Topology deployed

| Component     | Kind          | Exposure                 | Notes |
|---------------|---------------|---------------------------|-------|
| web           | Deployment    | Ingress (`web.localtest.me`)  | Next.js Admin UI |
| control-plane | Deployment    | Ingress (`api.localtest.me`)  | Fastify, runs `prisma migrate deploy` on start |
| search-api    | Deployment    | ClusterIP only (internal) | Go, SQLite in-memory + Meilisearch client |
| postgres      | StatefulSet + PVC | ClusterIP (headless, internal) | 1Gi PVC |
| redis         | Deployment    | ClusterIP (internal)      | no PVC (ephemeral cache) |
| meilisearch   | StatefulSet + PVC | ClusterIP (headless, internal) | 1Gi PVC |

All internal services are **never** referenced by the Ingress, satisfying
CONTRACT.md's "search-api/postgres/redis/meilisearch are internal-only" rule.

## Why custom Dockerfiles under `infra/docker/`

1. **`web.Dockerfile`** — `NEXT_PUBLIC_API_URL` is a Next.js *build-time*
   env var (inlined into the client JS bundle by `next build`). Since the
   Admin UI runs in the assessor's **browser**, it must call the
   control-plane's **host-reachable ingress URL**, not the in-cluster DNS
   name `http://control-plane:8080` (unreachable from a browser). The
   committed `apps/web/Dockerfile` doesn't accept this as a build arg, so
   this file (owned by Agent E, not Agent D) adds `ARG NEXT_PUBLIC_API_URL`
   before the `next build` step. `apps/web/Dockerfile` itself is untouched.

2. **`search-api.Dockerfile`** — identical to the root `Dockerfile` except
   it compiles with `go build -mod=vendor`. In this sandboxed build
   environment, outbound HTTPS to `proxy.golang.org` is intercepted by a
   corporate TLS proxy whose CA isn't trusted inside the `golang:1.25-alpine`
   builder image, so `go mod download` fails with
   `x509: certificate signed by unknown authority`. Running `go mod vendor`
   once on the host (which *does* trust the proxy CA via the macOS system
   keychain) and building with the vendored deps sidesteps the need for any
   network access during the image build. The root `Dockerfile` is untouched.

3. **`control-plane.Dockerfile`** — same underlying problem hits `npm ci`
   here too: `@prisma/client`/`prisma`'s postinstall step downloads a query
   engine binary from `https://binaries.prisma.sh` over HTTPS. This file
   additionally trusts any `*.pem` file dropped into `infra/docker/certs/`
   (empty/gitignored by default — a no-op on a normal machine) before
   running `npm ci` / `prisma generate`. `apps/control-plane/Dockerfile`
   itself is untouched.

If you're building on a machine without a TLS-intercepting proxy, none of
this matters — `infra/docker/certs/` is empty and `go mod vendor` is a no-op
extra step; everything else is byte-for-byte the same as the committed app
Dockerfiles.

## Bring-up (local k3d)

```bash
# 1. Cluster with the Traefik loadbalancer mapped to a free host port.
k3d cluster create saas --port "8088:80@loadbalancer" --agents 1 --wait

# 2. (Only if go mod download fails behind a TLS-intercepting proxy — see above)
go mod vendor

# 3. Build images on the host (host npm/go toolchain reach the registries).
docker build -f infra/docker/search-api.Dockerfile -t saas/search-api:local .
docker build -f infra/docker/control-plane.Dockerfile -t saas/control-plane:local .
docker build -f infra/docker/web.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://api.localtest.me:8088 \
  -t saas/web:local .

# 4. Import into the cluster's containerd (no registry needed).
k3d image import saas/search-api:local saas/control-plane:local saas/web:local -c saas

# 5. Deploy.
kubectl apply -k infra/k8s/overlays/local

# 6. Wait for rollout.
kubectl -n saas get pods -w
```

`*.localtest.me` resolves to `127.0.0.1` publicly, so no `/etc/hosts` edits
are needed.

- **Admin UI**: http://web.localtest.me:8088
- **Control plane API**: http://api.localtest.me:8088

Point the acceptance suite at these:

```
E2E_BASE_URL=http://web.localtest.me:8088
E2E_API_URL=http://api.localtest.me:8088
```

## Secrets (dev placeholders — see `infra/k8s/overlays/local/secret-patch.yaml`)

`JWT_SECRET`, `JWT_SECRET_KEY`, `MEILISEARCH_API_KEY`, `POSTGRES_USER`,
`POSTGRES_PASSWORD` are stored as a plain Kubernetes `Secret` with
placeholder dev values (`*-change-me`). This is acceptable for a local
submission per the task brief; do **not** reuse these values anywhere real.
The production (`gke`) overlay does not ship these placeholders at all —
see `infra/k8s/overlays/gke/README.md`.

## Production (GKE)

`infra/k8s/overlays/gke` is a production-hardened overlay of this same
topology: no dev-placeholder secrets (deleted, not shipped — a real
`saas-secrets` Secret must be supplied out-of-band, or sourced from GCP
Secret Manager via the Secret Manager CSI driver), 2 replicas + higher
resource limits for the stateless services, a GCE ingress with a reserved
static IP and a GKE-managed TLS cert, and HTTP → HTTPS redirect. See:

- `infra/terraform/README.md` — provisions the GKE Autopilot cluster,
  Artifact Registry repo, and the Workload-Identity-Federated deploy
  service account CI uses (no long-lived key).
- `infra/k8s/overlays/gke/README.md` — what the overlay changes, and the
  steps required before the first real `apply` (secrets, DNS, GitHub repo
  variables).
- `.github/workflows/deploy-gke.yml` — builds+pushes all three images and
  deploys on push to `main` / a `v*` tag. Skips (doesn't fail) until the
  required repo variables are configured.

`kubectl kustomize infra/k8s/overlays/gke` builds cleanly today with no
live cluster/credentials; it has not yet been `apply`'d to a real cluster.

## Acceptance-tuned config (local overlay only)

`infra/k8s/overlays/local/configmap-patch.yaml` overrides the base
defaults:

```
FREE_SEARCH_LIMIT=3
PRO_SEARCH_LIMIT=10
ALLOWED_SIGNUP_EMAILS=@e2e.test
```

## Persistence check

```bash
kubectl -n saas delete pod postgres-0
kubectl -n saas wait --for=condition=Ready pod/postgres-0 --timeout=120s
# re-run a query against control-plane to confirm prior data (users/orgs) is intact
```

The StatefulSet's `volumeClaimTemplates` PVC is not deleted by a pod
restart, only by explicitly deleting the PVC or the StatefulSet with
`--cascade=orphan` false and the PVC itself.

## Backup

```bash
kubectl -n saas exec postgres-0 -- pg_dump -U saas saas > backup-$(date +%F).sql
```

A GCS-uploading CronJob is out of scope for the local submission (optional
per the task brief) and is not implemented here.

## Known limitations

- `redis` has no PVC — cache data is lost on pod restart (acceptable; it's
  used only for rate-limit counters, not durable state).
- No HPA configured (optional per task brief) on either overlay.
- `infra/k8s/overlays/gke/**` has **not** been applied to any real GKE
  cluster by this repo's automation yet — see its own README for the
  operator steps required first.
- Ingress uses Traefik's default class shipped with k3d; no TLS/cert-manager
  is configured (not needed for local HTTP acceptance testing).
