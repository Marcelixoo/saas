# `/scripts`

The `scripts` folder contains automation scripts for local development.

## Available Scripts

### `dev-up.sh`

Convenience wrapper for the local developer environment (docker-compose).

**Usage:**
```bash
scripts/dev-up.sh          # data tier + Go search-api
scripts/dev-up.sh full     # also brings up control-plane + web
```

## Removed scripts

`setup-gcp.sh`, `setup-secrets.sh`, and `deploy.sh` were removed. They
targeted the legacy single-service Cloud Run deployment (see
`THREAT_MODEL_ANALYSIS.md` §7), which has been superseded by the
Kustomize-based multi-service topology in `infra/k8s/` (local k3d today,
GKE via `infra/terraform/` + `.github/workflows/deploy-gke.yml`). See
`infra/README.md` for the current deployment story.

## Best Practices

1. **Never commit secrets to version control**
2. **Use environment variables for CI/CD pipelines**
3. **Rotate service account keys regularly**
4. **Review IAM permissions periodically**
