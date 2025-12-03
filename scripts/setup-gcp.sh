#!/bin/bash

set -e

PROJECT_ID=$1
REGION=${2:-us-central1}

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 <project-id> [region]"
  echo "Example: $0 my-project-123 us-central1"
  exit 1
fi

echo "🔧 Setting up GCP project: $PROJECT_ID"
echo "========================================"

echo ""
echo "1️⃣  Setting active project..."
gcloud config set project $PROJECT_ID

echo ""
echo "2️⃣  Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  vpcaccess.googleapis.com \
  servicenetworking.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com

echo ""
echo "3️⃣  Creating Terraform state bucket..."
BUCKET_NAME="${PROJECT_ID}-terraform-state"
gsutil mb -p $PROJECT_ID -l $REGION gs://$BUCKET_NAME/ || echo "Bucket already exists"
gsutil versioning set on gs://$BUCKET_NAME/

echo ""
echo "4️⃣  Creating service account for GitHub Actions..."
SA_NAME="github-actions-deploy"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create $SA_NAME \
  --display-name "GitHub Actions Deploy" \
  --description "Used by GitHub Actions to deploy services" || echo "Service account already exists"

echo ""
echo "5️⃣  Granting permissions to service account..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"

echo ""
echo "6️⃣  Creating service account key..."
KEY_FILE="github-actions-key.json"
gcloud iam service-accounts keys create $KEY_FILE \
  --iam-account=$SA_EMAIL

echo ""
echo "✅ GCP project setup complete!"
echo ""
echo "Next steps:"
echo "1. Add the following secrets to your GitHub repository:"
echo "   - GCP_PROJECT_ID: $PROJECT_ID"
echo "   - GCP_SA_KEY: (paste contents of $KEY_FILE)"
echo ""
echo "2. Create terraform.tfvars from the example:"
echo "   cp terraform/terraform.tfvars.example terraform/terraform.tfvars"
echo ""
echo "3. Update terraform/main.tf backend bucket name to: $BUCKET_NAME"
echo ""
echo "⚠️  IMPORTANT: Keep $KEY_FILE secure and add it to .gitignore"
