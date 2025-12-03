#!/bin/bash

set -e

echo "🚀 Deploying Fashion Catalog API to GCP"
echo "========================================"

if [ ! -f "terraform/terraform.tfvars" ]; then
  echo "❌ terraform/terraform.tfvars not found"
  echo "Copy terraform/terraform.tfvars.example and fill in your values"
  exit 1
fi

cd terraform

echo "1️⃣  Initializing Terraform..."
terraform init

echo ""
echo "2️⃣  Planning infrastructure changes..."
terraform plan -out=tfplan

echo ""
read -p "Do you want to apply these changes? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Deployment cancelled"
  exit 0
fi

echo ""
echo "3️⃣  Applying infrastructure changes..."
terraform apply tfplan

echo ""
echo "4️⃣  Getting outputs..."
terraform output

echo ""
echo "✅ Infrastructure deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Configure GitHub secrets with the service account key"
echo "2. Push code to trigger GitHub Actions deployment"
echo "3. Configure custom domain DNS"
