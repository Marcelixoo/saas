# Quick Start - Deploy to GCP

## 5-Minute Setup

### 1. Setup GCP (2 minutes)

```bash
./scripts/setup-gcp.sh your-project-id us-central1
```

This creates:
- Service account for GitHub Actions
- Terraform state bucket
- Required API enablements

### 2. Configure GitHub (1 minute)

Add these secrets in **Settings → Secrets → Actions**:

```bash
GCP_PROJECT_ID=your-project-id
GCP_SA_KEY=<paste-github-actions-key.json>
JWT_SECRET_KEY=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 32)
```

### 3. Configure Terraform (1 minute)

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars`:
```hcl
project_id = "your-project-id"
db_password = "your-db-password"
jwt_secret = "your-jwt-secret"
custom_domain = "api.yourdomain.com"
```

Update `terraform/main.tf` backend:
```hcl
backend "gcs" {
  bucket = "your-project-id-terraform-state"
  prefix = "terraform/state"
}
```

### 4. Deploy (1 minute)

```bash
./scripts/deploy.sh
```

Press `yes` when prompted.

### 5. Configure DNS (5-60 minutes for propagation)

Get your Cloud Run URL:
```bash
cd terraform && terraform output cloud_run_url
```

In Vercel DNS, add CNAME:
```
api → saas-api-xxxxx-uc.a.run.app
```

### 6. Deploy Application (Automatic)

```bash
git add .
git commit -m "feat: Add GCP deployment"
git push origin main
```

GitHub Actions will automatically deploy!

## Verify Deployment

```bash
# Check health
curl https://api.yourdomain.com/api

# View docs
open https://api.yourdomain.com/docs/index.html
```

## Cost

**Development**: ~$30/month
**Production**: ~$65-90/month

## Rollback

```bash
gcloud run services update-traffic saas-api \
  --to-revisions PREVIOUS=100 --region us-central1
```

## Support

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

---

**That's it!** 🚀 Your API is now live on GCP with auto-scaling, backups, and monitoring.
