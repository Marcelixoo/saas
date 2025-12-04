#!/bin/bash
set -e

# Accept project ID as argument or use default
PROJECT_ID="${1:-criticalmars-saas}"
REGION="${2:-us-central1}"

echo "Setting up GCP Secrets for project: $PROJECT_ID"
echo "================================================"
echo ""

# Function to securely read secret values
read_secret() {
  local secret_name=$1
  local env_var=$2
  local default_prompt=$3

  # Check if value is provided via environment variable
  if [ -n "${!env_var}" ]; then
    echo "${!env_var}"
  else
    # Prompt user for input (hidden for sensitive values)
    read -s -p "$default_prompt: " secret_value
    echo >&2  # New line after hidden input
    echo "$secret_value"
  fi
}

# Function to create or update secret
create_or_update_secret() {
  local secret_name=$1
  local secret_value=$2

  if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
    echo "Secret $secret_name already exists. Adding new version..."
    echo -n "$secret_value" | gcloud secrets versions add "$secret_name" \
      --project="$PROJECT_ID" \
      --data-file=-
  else
    echo "Creating secret $secret_name..."
    echo -n "$secret_value" | gcloud secrets create "$secret_name" \
      --project="$PROJECT_ID" \
      --data-file=- \
      --replication-policy="automatic"
  fi
}

echo "📝 Please provide secret values (or set via environment variables):"
echo "   Environment variables: JWT_SECRET_KEY, DB_PASSWORD, DB_USER, DB_NAME"
echo ""

# Read secrets from environment or prompt
JWT_SECRET=$(read_secret "jwt-secret-key" "JWT_SECRET_KEY" "Enter JWT secret key")
DB_PASSWORD=$(read_secret "db-password" "DB_PASSWORD" "Enter database password")
DB_USER=$(read_secret "db-user" "DB_USER" "Enter database user")
DB_NAME=$(read_secret "db-name" "DB_NAME" "Enter database name")

echo ""
echo "Creating/updating secrets..."

create_or_update_secret "jwt-secret-key" "$JWT_SECRET"
create_or_update_secret "db-password" "$DB_PASSWORD"
create_or_update_secret "db-user" "$DB_USER"
create_or_update_secret "db-name" "$DB_NAME"

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
