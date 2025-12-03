#!/bin/bash
set -e

PROJECT_ID="criticalmars-saas"
REGION="us-central1"

echo "Setting up GCP Secrets for project: $PROJECT_ID"
echo "================================================"

echo -n "your-jwt-secret-from-env" | gcloud secrets create jwt-secret-key \
  --project="$PROJECT_ID" \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || echo "Secret jwt-secret-key already exists"

echo -n "vn^:s#4t6s?7ZmtpnvrW=-K=~Q@bbo" | gcloud secrets create db-password \
  --project="$PROJECT_ID" \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || echo "Secret db-password already exists"

echo -n "saas" | gcloud secrets create db-user \
  --project="$PROJECT_ID" \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || echo "Secret db-user already exists"

echo -n "saas" | gcloud secrets create db-name \
  --project="$PROJECT_ID" \
  --data-file=- \
  --replication-policy="automatic" \
  2>/dev/null || echo "Secret db-name already exists"

echo ""
echo "Getting project number..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
echo "Project number: $PROJECT_NUMBER"

echo ""
echo "Granting Secret Manager access to Cloud Run service account..."

for SECRET in jwt-secret-key db-password db-user db-name; do
  echo "Granting access to: $SECRET"
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    2>/dev/null || true
done

echo ""
echo "Granting access to GitHub Actions service account..."
for SECRET in jwt-secret-key db-password db-user db-name; do
  echo "Granting access to: $SECRET"
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:github-actions-deploy@criticalmars-saas.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    2>/dev/null || true
done

echo ""
echo "✅ Secrets setup complete!"
echo ""
echo "Listing all secrets:"
gcloud secrets list --project="$PROJECT_ID"

echo ""
echo "Verifying secret values (first 10 chars only):"
for SECRET in jwt-secret-key db-password db-user db-name; do
  VALUE=$(gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT_ID" 2>/dev/null || echo "ERROR")
  echo "$SECRET: ${VALUE:0:10}..."
done
