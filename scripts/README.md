# `/scripts`

The `scripts` folder contains automation scripts for infrastructure setup, deployment, and operations.

## Available Scripts

### `setup-gcp.sh`

Sets up the initial GCP project infrastructure including APIs, service accounts, and Terraform state bucket.

**Usage:**
```bash
./scripts/setup-gcp.sh <project-id> [region]
```

**Example:**
```bash
./scripts/setup-gcp.sh my-project-123 europe-west3
```

**Features:**
- Enables required GCP APIs
- Creates Terraform state bucket with versioning
- Creates GitHub Actions service account
- Manages service account keys safely (checks for existing keys)
- Grants necessary IAM permissions

**Security Notes:**
- The script checks for existing service account keys before creating new ones
- Warns if multiple keys exist (GCP limit is 10 per service account)
- Prompts before overwriting existing key files

### `setup-secrets.sh`

Creates or updates secrets in GCP Secret Manager for the application.

**Usage:**
```bash
# Interactive mode (prompts for values)
./scripts/setup-secrets.sh [project-id] [region]

# Using environment variables (recommended for CI/CD)
JWT_SECRET_KEY="your-secret" \
DB_PASSWORD="secure-password" \
DB_USER="dbuser" \
DB_NAME="dbname" \
./scripts/setup-secrets.sh my-project-123
```

**Example:**
```bash
# Interactive
./scripts/setup-secrets.sh criticalmars-saas europe-west3

# Automated
export JWT_SECRET_KEY=$(openssl rand -base64 32)
export DB_PASSWORD=$(openssl rand -base64 32)
export DB_USER="saas"
export DB_NAME="fashiondb"
./scripts/setup-secrets.sh
```

**Security Features:**
- Accepts secrets via environment variables (no hardcoded values)
- Falls back to secure prompts (hidden input) if env vars not set
- Creates new versions of existing secrets instead of failing
- Automatically grants access to Cloud Run and GitHub Actions service accounts

**Environment Variables:**
- `JWT_SECRET_KEY` - JWT signing secret
- `DB_PASSWORD` - Database password
- `DB_USER` - Database username
- `DB_NAME` - Database name

## Best Practices

1. **Never commit secrets to version control**
2. **Use environment variables for CI/CD pipelines**
3. **Rotate service account keys regularly**
4. **Review IAM permissions periodically**
5. **Keep key files secure and add to .gitignore**

## References

- https://github.com/istio/istio/tree/master/common/scripts