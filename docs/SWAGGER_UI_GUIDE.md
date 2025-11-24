# Swagger UI Quick Start Guide

## Accessing the Documentation

1. **Start the server**:
   ```bash
   export JWT_SECRET_KEY="your-secret-key"
   go run cmd/server/main.go
   ```

2. **Open your browser** to:
   ```
   http://localhost:8080/
   ```

## What You'll See

### Main Interface

```
┌──────────────────────────────────────────────────────────────┐
│  Fashion Catalog API                                v1.0.0   │
│  ────────────────────────────────────────────────────────    │
│                                                               │
│  Multi-tenant SaaS platform for managing fashion articles    │
│  with JWT-based authentication and role-based access control │
│                                                               │
│  [Authorize 🔓]                          [Explore]           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ▼ Authentication                                             │
│     POST /auth/register     Register new user                │
│     POST /auth/login        Login user                       │
│     POST /auth/refresh      Refresh access token             │
│     GET  /api/me            Get current user                 │
│                                                               │
│  ▼ Articles                                                   │
│     POST /articles          Create article                   │
│     POST /articles/batch    Create multiple articles         │
│                                                               │
│  ▼ Authors                                                    │
│     POST /authors           Create author                    │
│     POST /authors/batch     Create multiple authors          │
│                                                               │
│  ▼ Tags                                                       │
│     GET  /tags              List all tags                    │
│     GET  /tags/{label}      Get tag by label                 │
│     POST /tags              Create tag                       │
│     PATCH /tags/{label}     Update tag                       │
│     POST /tags/batch        Create multiple tags             │
│     GET  /tags/{label}/articles  Get articles by tag         │
│                                                               │
│  ▼ Search                                                     │
│     GET  /search            Search articles (rate-limited)   │
│                                                               │
│  ▼ Schemas                                                    │
│     Error, User, TokenResponse, Article, Author, Tag         │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Step-by-Step: Testing Your First Endpoint

### 1. Test Registration (No Auth Required)

Click on `POST /auth/register` to expand:

```
POST /auth/register
Register new user

Creates a new user account with an associated tenant.
The user becomes an admin of the newly created tenant.

[Try it out]

Parameters

Request body (required)
  application/json

  {
    "email": "newuser@example.com",
    "password": "SecurePass123!",
    "tenant_name": "My Fashion Store"
  }

  [↓ Example Value]  [↓ Schema]

Responses
  201  User created successfully
  400  Invalid input
  409  Email already registered

[Execute]
```

**Steps**:
1. Click **"Try it out"** button
2. Edit the JSON (change email to your own)
3. Click **"Execute"** button
4. See the response below with your access token!

### 2. Authorize for Protected Endpoints

After registration, you'll get a response like:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzZTQ1NjctZTg5Yi0xMmQzLWE0NTYtNDI2NjE0MTc0MDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiaXNzIjoiZmFzaGlvbi1jYXRhbG9nIiwiaWF0IjoxNzM3OTczNDAwLCJleHAiOjE3MzgwNTk4MDB9.signature",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com"
  }
}
```

**To authorize**:
1. Copy the `access_token` value (long string)
2. Click the **"Authorize 🔓"** button at top right
3. In the popup, paste: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
4. Click **"Authorize"**
5. Click **"Close"**

Now the lock icon changes: **🔓 → 🔒** (authenticated!)

### 3. Test Authenticated Endpoint

Try `GET /api/me`:

```
GET /api/me
Get current user

Returns authenticated user information

🔒 (authorization required)

[Try it out]

[Execute]
```

Click **"Execute"** and see your user info:

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "created_at": "2025-01-24T10:30:00Z"
}
```

## Advanced Features

### Multiple Examples

Some endpoints have multiple examples:

```
POST /articles

Examples:
  [↓ full]           Article with tags
  [↓ minimal]        Minimal article
```

Click different examples to see various use cases!

### Response Examples

After executing, you see:

```
Responses

Code: 201
Details: User created successfully

Response body
{
  "access_token": "...",
  "token_type": "Bearer",
  ...
}

Response headers
content-type: application/json; charset=utf-8
```

### Copy as cURL

After executing any request, find the **"Copy"** button to get:

```bash
curl -X 'POST' \
  'http://localhost:8080/auth/register' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "tenant_name": "My Store"
}'
```

Paste this into your terminal!

## Common Tasks

### Test Article Creation

1. First create an author:
   ```
   POST /authors
   {
     "name": "Jane Smith"
   }
   ```
   Note the returned `id` (e.g., 1)

2. Create article with that author:
   ```
   POST /articles
   {
     "title": "My Article",
     "body": "Article content...",
     "author_id": 1,
     "tags": ["fashion", "2025"]
   }
   ```

### Test Search

```
GET /search?q=fashion&limit=10
```

Try the parameters:
- `q` = search query
- `limit` = results per page
- `offset` = pagination
- `filter` = filter by field
- `sort` = sort order

### Test Rate Limiting

Make more than 60 requests in a minute to `/search`:

Response after limit:
```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

## Keyboard Shortcuts

- **Tab** - Navigate between fields
- **Ctrl/Cmd + Enter** - Execute request
- **Esc** - Collapse expanded endpoint

## Mobile View

The Swagger UI is responsive! Works on:
- Desktop browsers
- Tablets
- Mobile phones

## Tips & Tricks

### 1. Persistent Authentication
Your Bearer token persists across:
- Page refreshes
- Browser restarts
- Different endpoints

### 2. Schema Reference
Click on schema names (e.g., `TokenResponse`) to jump to definition:

```
▼ TokenResponse
  {
    access_token*    string
    refresh_token*   string
    token_type*      string
    expires_in*      integer($int64)
    user*            {
      id*     string($uuid)
      email*  string($email)
    }
  }
```

### 3. Validation Errors
Swagger validates before sending:

```
❌ email: should match format "email"
❌ password: should be >= 8 characters
```

Fix errors before executing!

### 4. Download Spec
Click **"Download"** at top to save `swagger.yaml` for:
- Postman import
- Client generation
- Offline reference

## Troubleshooting

### "Failed to fetch"
- Check server is running: `curl http://localhost:8080/api`
- Check URL is correct
- Check browser console for CORS errors

### "401 Unauthorized"
- Token expired (24h default)
- Re-login to get new token
- Click "Authorize" again

### "404 Not Found"
- Check endpoint path
- Check method (POST vs GET)
- Check server logs

### Parameter not working
- Check required vs optional
- Check data type (string vs integer)
- Check format (email, uuid, etc.)

## Visual Legend

```
🔓  Not authenticated (lock open)
🔒  Authenticated (lock closed)
▼   Expanded section
▶   Collapsed section
*   Required field
```

## For Examiners/Reviewers

**No setup required!** Just:

1. Run: `JWT_SECRET_KEY="test" go run cmd/server/main.go`
2. Open: `http://localhost:8080/`
3. Click around and test endpoints!

**All endpoints are live and testable** directly from the browser.

## API Coverage

**17 documented endpoints** across:
- ✅ Authentication (4)
- ✅ Articles (2)
- ✅ Authors (2)
- ✅ Tags (6)
- ✅ Search (1)
- ✅ Meta (2)

Every endpoint includes:
- Description
- Parameters with types
- Request body schema
- Response examples
- Error responses
- Multiple examples where applicable

---

**Start exploring your API! 🚀**

No coding required - just click, edit, and execute!
