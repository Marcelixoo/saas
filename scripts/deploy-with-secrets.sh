#!/bin/bash
set -e

PROJECT_ID="criticalmars-saas"
REGION="europe-west3"
JWT_SECRET="m/mNGT7twj/9jO7Ml9jXq3XkadCnv+QzI1fPX/ME5mI="
DB_PASSWORD="vn^:s#4t6s?7ZmtpnvrW=-K=~Q@bbo"
DB_USER="saas"
DB_NAME="saas"

echo "🚀 Complete GCP Deployment with Secrets"
echo "========================================"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

echo "Step 1: Authenticating with service account..."
echo "$GCP_SA_KEY" | base64 -d > /tmp/gcp-key.json
gcloud auth activate-service-account --key-file=/tmp/gcp-key.json
gcloud config set project "$PROJECT_ID"

echo ""
echo "Step 2: Creating/Updating secrets in Secret Manager..."

echo "  - jwt-secret-key"
echo -n "$JWT_SECRET" | gcloud secrets create jwt-secret-key \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || \
  echo -n "$JWT_SECRET" | gcloud secrets versions add jwt-secret-key --data-file=-

echo "  - db-password"
echo -n "$DB_PASSWORD" | gcloud secrets create db-password \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || \
  echo -n "$DB_PASSWORD" | gcloud secrets versions add db-password --data-file=-

echo "  - db-user"
echo -n "$DB_USER" | gcloud secrets create db-user \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || \
  echo -n "$DB_USER" | gcloud secrets versions add db-user --data-file=-

echo "  - db-name"
echo -n "$DB_NAME" | gcloud secrets create db-name \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || \
  echo -n "$DB_NAME" | gcloud secrets versions add db-name --data-file=-

echo ""
echo "Step 3: Getting project number..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
echo "  Project number: $PROJECT_NUMBER"

echo ""
echo "Step 4: Granting Secret Manager access..."

for SECRET in jwt-secret-key db-password db-user db-name; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null || true

  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:github-actions-deploy@criticalmars-saas.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null || true
done

echo ""
echo "Step 5: Enabling required APIs..."
gcloud services enable compute.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable vpcaccess.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com

echo ""
echo "Step 6: Deploying infrastructure with Terraform..."
cd terraform

echo "  - Initializing Terraform..."
terraform init

echo "  - Planning infrastructure..."
terraform plan -out=tfplan

echo ""
echo "  - Applying infrastructure..."
terraform apply -auto-approve tfplan

echo ""
echo "Step 7: Getting deployment outputs..."
terraform output

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Verify secrets: gcloud secrets list"
echo "2. Check Cloud Run service: gcloud run services list"
echo "3. Test the API endpoint"
echo "4. Configure custom domain DNS"

rm -f /tmp/gcp-key.json
