#!/bin/bash

set -e

PROJECT_ID=$1
REGION=${2:-europe-west3}

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 <project-id> [region]"
  echo "Example: $0 my-project-123 europe-west3"
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
  iam.googleapis.com |
  artifactregistry.googleapis.com

echo ""
echo "3️⃣  Creating Terraform state bucket..."
BUCKET_NAME="${PROJECT_ID}-terraform-state"

if gsutil ls -p $PROJECT_ID gs://$BUCKET_NAME/ &>/dev/null; then
  echo "Bucket gs://$BUCKET_NAME/ already exists"
else
  echo "Creating bucket gs://$BUCKET_NAME/..."
  gsutil mb -p $PROJECT_ID -l $REGION gs://$BUCKET_NAME/
  echo "Enabling versioning on bucket..."
  gsutil versioning set on gs://$BUCKET_NAME/
fi

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

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.admin"

echo ""
echo "6️⃣  Creating service account key..."
KEY_FILE="github-actions-key.json"

if [ -f "$KEY_FILE" ]; then
  echo "⚠️  Warning: $KEY_FILE already exists!"
  read -p "Do you want to create a new key? This will not delete the old one. (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping key creation. Using existing key file."
    SKIP_KEY_CREATION=true
  fi
fi

if [ "$SKIP_KEY_CREATION" != "true" ]; then
  # List existing keys
  EXISTING_KEYS=$(gcloud iam service-accounts keys list --iam-account=$SA_EMAIL --filter="keyType=USER_MANAGED" --format="value(name)" | wc -l)
  echo "Service account currently has $EXISTING_KEYS user-managed key(s)"

  if [ "$EXISTING_KEYS" -ge 2 ]; then
    echo "⚠️  Warning: Service account already has 2 or more keys!"
    echo "Consider deleting old keys before creating new ones to stay within limits."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Skipping key creation."
      SKIP_KEY_CREATION=true
    fi
  fi

  if [ "$SKIP_KEY_CREATION" != "true" ]; then
    echo "Creating new service account key..."
    gcloud iam service-accounts keys create $KEY_FILE \
      --iam-account=$SA_EMAIL
    echo "✅ Key created successfully: $KEY_FILE"
  fi
fi

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
