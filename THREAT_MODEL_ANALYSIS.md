# Threat Model Analysis

## 1. System Context

This SaaS platform is written in **Go** (using either a lightweight HTTP framework or `net/http`) and deployed on **Google Cloud Run**.
Organizations can create teams and subscribe to plans with different rate limits (e.g., **Basic = 10 req/s**, **Premium = 50 req/s**).
A billable “report rendering” endpoint is authenticated and rate-limited.

State is stored in:

- **PostgreSQL (Cloud SQL)** for users, organizations, roles, plans, usage logs.
- **Redis / Memorystore** for token buckets and caching.
- **Google Cloud Storage (GCS)** for rendered report artifacts.

The system exposes both free and paid endpoints and enforces quota, roles, and strict tenant isolation.

## 2. Assets

### Primary Assets
- User accounts and JWT authentication tokens  
- Organization membership, roles, and plan data  
- Quota / usage data influencing billing  
- Report metadata and rendered artifacts (GCS)  
- Billing-relevant logs (usage metrics, rate-limit hits, errors)

### Secondary Assets
- API availability (Cloud Run autoscaling)  
- Redis integrity (rate-limiting correctness)  
- Secrets (JWT signing keys, DB credentials)  
- CI/CD pipeline integrity (GitHub Actions → Cloud Run)

## 3. Threats & Mitigations

### 3.1 Authentication Bypass
**Threat:**  
Attacker calls protected or paid endpoints without valid authentication or forges JWT tokens.

**Mitigations:**  
- Mandatory JWT verification middleware for all protected endpoints  
- Tokens signed using HS256/ES256 keys from **Secret Manager**  
- Short TTL for JWTs and support for key rotation  
- Server-side validation for social login ID tokens (Google OIDC, etc.)


### 3.2 Authorization Errors & Privilege Escalation
**Threat:**  
- Free users access premium features  
- Members gain admin-level abilities  
- Cross-tenant data exposure (Org A accesses Org B resources)

**Mitigations:**  
- Handler-level checks for both `role` and `plan`  
- Tenant ID always derived from JWT, never from request payload  
- All database queries include `WHERE org_id = $1`  
- Negative-path authorization tests


### 3.3 Rate-Limit Bypass & Resource Abuse
**Threat:**  
- Attackers attempt parallel requests to bypass quotas  
- High load triggers excessive Cloud Run scaling → financial DoS

**Mitigations:**  
- Go-based rate limiter using Redis atomic ops / Lua scripts  
- Token bucket capacity defined per-plan (`basic` vs `premium`)  
- Logging all 429 responses  
- Cloud Run max instance limit to control cost


### 3.4 Injection Attacks
**Threat:**  
- SQL injection in API filters  
- Path manipulation in report retrieval  
- Unsafe JSON mass assignment

**Mitigations:**  
- Parameterized queries (using `database/sql`, pgx, or ORM)  
- Only internal object IDs accepted—never raw file paths  
- Strict JSON decoding into typed Go structs


### 3.5 Multi-Tenant Data Leakage
**Threat:**  
Incorrect scoping: a user from Org A can access Org B resources.

**Mitigations:**  
- Mandatory tenant scoping in all repository methods  
- Tenant extracted solely from JWT claims  
- Integration tests verifying correct isolation


### 3.6 Transport Layer Attacks
**Threat:**  
Interception or tampering of traffic.

**Mitigations:**  
- HTTPS enforced by Cloud Run  
- HSTS enabled at domain level  
- Never include JWTs in query parameters


### 3.7 Secret Leakage
**Threat:**  
JWT signing key or DB password leaks through code, logs, or CI.

**Mitigations:**  
- All production secrets stored in **Secret Manager**  
- `.env` files excluded via `.gitignore`  
- GitHub Actions access restricted with least privilege


### 3.8 Artifact & Storage Security
**Threat:**  
- Public exposure of private GCS-stored reports  
- Guessable file names allow unauthorized downloads

**Mitigations:**  
- GCS buckets set to **private**  
- Signed URLs with short TTL for artifact downloads  
- UUID-based object keys


### 3.9 Denial-of-Service (DoS)
**Threat:**  
- Attackers generate extreme traffic  
- Expensive DB operations degrade service

**Mitigations:**  
- Cloud Run max concurrency + instance caps  
- Global rate limit for unauthenticated endpoints  
- Slow query logging + index optimization


### 3.10 Supply Chain & Dependency Risks
**Threat:**  
Malicious or vulnerable Go modules.

**Mitigations:**  
- `govulncheck` in CI  
- Dependency pinning in `go.mod`  
- Clean-up of unused modules

---

### 3.11 CI/CD Pipeline Risks
**Threat:**  
- Compromised GitHub Actions workflow  
- Leakage of deploy credentials

**Mitigations:**  
- GitHub Actions OIDC → GCP Workload Identity  
- Production deploys restricted to approved workflows  
- Optional manual approval step


## 4. Additional Observations

- Add audit logs for all paid endpoint usage  
- Add alerting for spikes in 401/403/429 errors  
- Fail-closed for Redis outages (block paid endpoints if quota cannot be checked)


## 5. Security Checklist

| Area                     | Status | Notes |
| ------------------------ | ------ | ----- |
| Authentication           | `TODO`   | JWT middleware in Go |
| Authorization (RBAC)    | `TODO`   | Role + plan checks |
| Multi-tenant isolation   | `TODO`   | Ensure all DB queries are tenant-scoped |
| Input validation         | `TODO`   | Expand JSON/struct validation |
| Secrets management       | `TODO` | Move private keys + DB creds to Secret Manager |
| Rate limiting            | `TODO`   | Redis token buckets per plan |
| Logging & monitoring     | `TODO`   | Add dashboards + alerts |
| Transport security       | `TODO`   | HTTPS enforced by Cloud Run |
| Storage security         | `TODO`   | Signed URLs + private buckets |
| Dependency security      | `TODO`   | Add `govulncheck` to CI |
| CI/CD security           | `TODO`   | Least-privilege OIDC setup |