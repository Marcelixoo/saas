# GCP Deployment Guide

## Quick Start

Deploy the Fashion Catalog API to Google Cloud Platform in 3 steps:

```bash
# 1. Setup GCP project
./scripts/setup-gcp.sh your-project-id europe-west3

# 2. Configure Terraform
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit terraform.tfvars with your values

# 3. Deploy infrastructure
./scripts/deploy.sh
```

## Prerequisites

### Required Tools
- **gcloud CLI** - Google Cloud SDK
- **Terraform** - Version 1.0 or higher
- **Docker** - For local testing
- **Git** - Version control

### GCP Project Requirements
- Active GCP project with billing enabled
- Owner or Editor permissions
- APIs enabled (handled by setup script)

## Step-by-Step Deployment

### 1. Initial GCP Setup

Run the setup script to configure your GCP project:

```bash
chmod +x scripts/setup-gcp.sh
./scripts/setup-gcp.sh your-project-id europe-west3
```

This script will:
- Enable required GCP APIs
- Create Terraform state bucket
- Create service account for GitHub Actions
- Generate service account key

**Output**: `github-actions-key.json` (keep this secure!)

### 2. Configure GitHub Secrets

Add these secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `GCP_PROJECT_ID` | your-project-id | Your GCP project ID |
| `GCP_SA_KEY` | (paste JSON) | Contents of github-actions-key.json |
| `JWT_SECRET_KEY` | random-string | JWT signing secret (generate strong key) |
| `DB_PASSWORD` | strong-password | PostgreSQL password |

Generate strong secrets:
```bash
openssl rand -base64 32
```

### 3. Configure Terraform Variables

Create your Terraform variables file:

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars`:

```hcl
project_id = "your-project-id"
region     = "europe-west3"
environment = "prod"

db_tier    = "db-f1-micro"
db_password = "your-secure-password"

jwt_secret = "your-jwt-secret"

custom_domain = "api.yourdomain.com"

min_instances = 1
max_instances = 3
```

### 4. Update Terraform Backend

Edit `terraform/main.tf` and set your bucket name:

```hcl
backend "gcs" {
  bucket = "your-project-id-terraform-state"
  prefix = "terraform/state"
}
```

### 5. Deploy Infrastructure

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

This will:
1. Initialize Terraform
2. Show you the planned changes
3. Ask for confirmation
4. Deploy all resources

Expected resources:
- Cloud Run service (saas-api)
- Cloud SQL PostgreSQL instance
- VPC network and connector
- Secret Manager secrets
- IAM service accounts

**Deployment time**: ~10-15 minutes

### 6. Configure Custom Domain

#### Get Cloud Run URL

After deployment, get your service URL:

```bash
cd terraform
terraform output cloud_run_url
```

Output example: `https://saas-api-xxxxx-uc.a.run.app`

#### Configure Vercel DNS

In your Vercel DNS settings:

1. Go to your domain settings
2. Add a CNAME record:
   ```
   Name: api
   Type: CNAME
   Value: saas-api-xxxxx-uc.a.run.app
   ```
3. Save and wait for DNS propagation (~5-60 minutes)

#### Verify Domain

In Google Cloud Console:
1. Go to Cloud Run → saas-api
2. Click "Manage Custom Domains"
3. Add your domain: api.yourdomain.com
4. Follow verification steps

### 7. Deploy Application via GitHub Actions

Push to main branch to trigger deployment:

```bash
git add .
git commit -m "feat: Add GCP deployment configuration"
git push origin main
```

GitHub Actions will:
1. Build Docker image
2. Push to GitHub Container Registry
3. Deploy to Cloud Run
4. Run health checks

Monitor deployment: **Actions** tab in GitHub

### 8. Verify Deployment

Check service health:

```bash
curl https://api.yourdomain.com/api
```

Expected response:
```json
{
  "name": "Fashion Catalog API",
  "version": "1.0.0",
  "docs": "/docs/index.html"
}
```

## Architecture Overview

```
┌─────────────────────────────────────────┐
│          Vercel DNS (CNAME)             │
│     api.yourdomain.com → Cloud Run      │
└────────────────┬────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │   Cloud Run        │
        │  Min: 1, Max: 3    │
        │  Port: 8080        │
        │  Memory: 512Mi     │
        └─────────┬──────────┘
                  │
          ┌───────┴───────┐
          │               │
          ▼               ▼
   ┌─────────────┐  ┌─────────────┐
   │ Secret Mgr  │  │  Cloud SQL  │
   │ - JWT Key   │  │ PostgreSQL  │
   │ - DB URL    │  │ Private IP  │
   └─────────────┘  └─────────────┘
```

## Cost Estimation

### Development Environment
```
Cloud Run:
  - 1 instance always on: ~$12/month
  - Additional requests: $0.40/million

Cloud SQL (db-f1-micro):
  - Instance: ~$7/month
  - Storage (10GB): ~$1.70/month

Networking:
  - VPC connector: ~$9/month
  - Egress: ~$2/month

Total: ~$30-35/month
```

### Production Environment (Recommended)
```
Cloud Run:
  - 1-3 instances: ~$12-36/month
  - Additional requests: $0.40/million

Cloud SQL (db-n1-standard-1):
  - Instance: ~$35/month
  - Storage (20GB): ~$3.40/month
  - Backups: ~$1/month

Networking:
  - VPC connector: ~$9/month
  - Egress: ~$5/month

Total: ~$65-90/month
```

## Scaling Configuration

### Adjust Cloud Run Instances

Edit `terraform/terraform.tfvars`:

```hcl
min_instances = 2
max_instances = 10
```

Apply changes:
```bash
cd terraform && terraform apply
```

### Upgrade Database

Edit `terraform/terraform.tfvars`:

```hcl
db_tier = "db-n1-standard-1"
```

Apply changes:
```bash
cd terraform && terraform apply
```

## Monitoring & Logs

### View Logs

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=saas-api" --limit 50 --format json
```

### Check Metrics

Google Cloud Console → Cloud Run → saas-api → Metrics

Monitor:
- Request count
- Request latency
- Error rate
- CPU utilization
- Memory utilization

### Set up Alerts (Optional)

Create alerts for:
- Error rate > 5% for 5 minutes
- P95 latency > 1 second
- CPU > 80%
- Memory > 80%

## Troubleshooting

### Deployment Fails

Check GitHub Actions logs:
```
Actions → Latest workflow → View logs
```

Common issues:
- Missing GCP secrets
- Invalid service account permissions
- API not enabled

### Service Not Responding

Check Cloud Run logs:
```bash
gcloud run services logs read saas-api --limit 100
```

### Database Connection Issues

Verify VPC connector:
```bash
gcloud compute networks vpc-access connectors describe saas-api-connector --region europe-west3
```

Check Cloud SQL status:
```bash
gcloud sql instances describe saas-api-db-prod
```

### Domain Not Working

Verify DNS propagation:
```bash
dig api.yourdomain.com
```

Check Cloud Run domain mapping:
```bash
gcloud run domain-mappings list --region europe-west3
```

## Security Best Practices

### Secrets Management
- ✅ Use Secret Manager for sensitive data
- ✅ Rotate secrets regularly
- ✅ Never commit secrets to Git
- ✅ Use different secrets per environment

### Database Security
- ✅ Private IP only (no public access)
- ✅ SSL/TLS enforced
- ✅ Automated backups enabled
- ✅ Point-in-time recovery enabled

### Network Security
- ✅ VPC connector for private communication
- ✅ Firewall rules for health checks only
- ✅ Cloud Armor (optional) for DDoS protection

### IAM Security
- ✅ Principle of least privilege
- ✅ Separate service accounts per service
- ✅ Regular access reviews

## Rollback Procedures

### Rollback Application

Cloud Run keeps previous revisions:

```bash
gcloud run services update-traffic saas-api \
  --to-revisions PREVIOUS-REVISION=100 \
  --region europe-west3
```

List revisions:
```bash
gcloud run revisions list --service saas-api --region europe-west3
```

### Rollback Infrastructure

Using Terraform:

```bash
cd terraform
git checkout previous-commit
terraform plan
terraform apply
```

### Restore Database

Point-in-time recovery:

```bash
gcloud sql backups restore BACKUP-ID \
  --backup-instance=saas-api-db-prod \
  --restore-instance=saas-api-db-prod
```

## Maintenance

### Update Dependencies

1. Update go.mod
2. Build and test locally
3. Push to trigger deployment

### Apply Security Patches

Cloud Run automatically applies OS patches.

For Go dependencies:
```bash
go get -u ./...
go mod tidy
```

### Database Maintenance

Automated by Cloud SQL:
- Daily backups
- Weekly maintenance windows
- Automatic patch management

## Clean Up Resources

To destroy all resources:

```bash
cd terraform
terraform destroy
```

**Warning**: This will delete:
- Cloud Run service
- Cloud SQL database (and all data)
- VPC network
- All secrets

## Support & Resources

- [GCP Documentation](https://cloud.google.com/docs)
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud SQL Docs](https://cloud.google.com/sql/docs)
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)

---

**Deployment Status**: Ready for production 🚀
