#!/bin/bash
set -e

PROJECT_ID="${1:-criticalmars-saas}"
REGION="${2:-europe-west3}"
SERVICE_NAME="meilisearch"

echo "🚀 Deploying Meilisearch to Cloud Run"
echo "======================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Check if MEILI_MASTER_KEY is set, otherwise generate one
if [ -z "$MEILI_MASTER_KEY" ]; then
  echo "⚠️  MEILI_MASTER_KEY not set. Generating a secure random key..."
  MEILI_MASTER_KEY=$(openssl rand -base64 32)
  echo "✅ Generated master key (save this!): $MEILI_MASTER_KEY"
  echo ""
fi

echo "1️⃣  Creating secret for Meilisearch master key..."
if gcloud secrets describe meilisearch-master-key --project="$PROJECT_ID" &>/dev/null; then
  echo "Secret meilisearch-master-key already exists. Adding new version..."
  echo -n "$MEILI_MASTER_KEY" | gcloud secrets versions add meilisearch-master-key \
    --project="$PROJECT_ID" \
    --data-file=-
else
  echo "Creating secret meilisearch-master-key..."
  echo -n "$MEILI_MASTER_KEY" | gcloud secrets create meilisearch-master-key \
    --project="$PROJECT_ID" \
    --data-file=- \
    --replication-policy="automatic"
fi

echo ""
echo "2️⃣  Deploying Meilisearch service..."
gcloud run deploy $SERVICE_NAME \
  --image getmeili/meilisearch:v1.5 \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 3 \
  --port 7700 \
  --set-env-vars "MEILI_ENV=production,MEILI_NO_ANALYTICS=true" \
  --set-secrets "MEILI_MASTER_KEY=meilisearch-master-key:latest" \
  --project $PROJECT_ID

echo ""
echo "3️⃣  Getting Meilisearch URL..."
MEILISEARCH_URL=$(gcloud run services describe $SERVICE_NAME \
  --region $REGION \
  --format 'value(status.url)' \
  --project $PROJECT_ID)

echo ""
echo "4️⃣  Storing Meilisearch URL in Secret Manager..."
if gcloud secrets describe meilisearch-host --project="$PROJECT_ID" &>/dev/null; then
  echo "Secret meilisearch-host already exists. Adding new version..."
  echo -n "$MEILISEARCH_URL" | gcloud secrets versions add meilisearch-host \
    --project="$PROJECT_ID" \
    --data-file=-
else
  echo "Creating secret meilisearch-host..."
  echo -n "$MEILISEARCH_URL" | gcloud secrets create meilisearch-host \
    --project="$PROJECT_ID" \
    --data-file=- \
    --replication-policy="automatic"
fi

echo ""
echo "5️⃣  Granting secret access to Cloud Run service accounts..."

# Get project number for default compute service account
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Granting access to default compute service account: $COMPUTE_SA"

for SECRET in meilisearch-master-key meilisearch-host; do
  echo "  - Granting access to $SECRET..."
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None \
    2>/dev/null || echo "    (binding may already exist)"
done

echo ""
echo "✅ Meilisearch deployed successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Deployment Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 Meilisearch URL: $MEILISEARCH_URL"
echo "🔑 Master Key: $MEILI_MASTER_KEY"
echo ""
echo "⚠️  IMPORTANT: Save the master key above! You'll need it to:"
echo "   - Make administrative requests to Meilisearch"
echo "   - Configure your application to use authenticated endpoints"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Update your API service to use Meilisearch:"
echo ""
echo "   gcloud run services update saas-api \\"
echo "     --update-secrets \"MEILISEARCH_HOST=meilisearch-host:latest,MEILISEARCH_API_KEY=meilisearch-master-key:latest\" \\"
echo "     --region $REGION \\"
echo "     --project $PROJECT_ID"
echo ""
echo "   Note: The secret is named 'meilisearch-master-key' but mapped to env var 'MEILISEARCH_API_KEY'"
echo ""
echo "2️⃣  Update your application code to use the master key for authentication"
echo ""
echo "3️⃣  Test the Meilisearch instance:"
echo ""
echo "   curl -H \"Authorization: Bearer $MEILI_MASTER_KEY\" \\"
echo "     $MEILISEARCH_URL/health"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  Production Notes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "- This deployment uses EPHEMERAL storage"
echo "- Data will be LOST on container restart"
echo "- For production with persistence, consider:"
echo "  • Meilisearch Cloud (recommended)"
echo "  • GCE VM with persistent disk"
echo "  • Cloud Run with Cloud Storage sync"
echo ""
echo "See: docs/MEILISEARCH_DEPLOYMENT.md for alternatives"
echo ""
