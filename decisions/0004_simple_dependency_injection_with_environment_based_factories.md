# Simple dependency injection with environment-based factories

## Context and Problem Statement

As the application matured to support multiple database backends (PostgreSQL and SQLite) and different deployment environments (local development, preview/staging, production), the main.go file grew to over 190 lines with duplicated initialization logic across database branches. This duplication made the codebase harder to maintain and introduced risks of inconsistencies between environments.

Key challenges:
- **Duplication:** Nearly identical setup code for PostgreSQL and SQLite paths
- **Testability:** Difficult to test different environment configurations
- **Onboarding:** New developers needed to understand complex branching logic
- **Environment Management:** No clear separation between development, preview, and production setups
- **Database Configuration:** Multiple environments required different database backends (local Postgres via Docker, in-memory SQLite for preview, Cloud SQL for production)

## Decision Outcome

Implement a lightweight dependency injection system using environment-based factory functions without external DI frameworks. The solution uses native Go constructs with a single `APP_ENV` environment variable to determine which dependencies to initialize.

### Core Design

**File:** `internal/dependencies.go`

Three factory functions corresponding to environment types:
- `newDevelopmentDeps()` - PostgreSQL running in local Docker Compose
- `newPreviewDeps()` - In-memory SQLite for ephemeral preview deployments
- `newProductionDeps()` - Cloud SQL PostgreSQL with connection pooling

**Dependency Container Structure:**
```go
type Dependencies struct {
    DB          *sql.DB
    Users       models.UserRepository
    Tenants     models.TenantRepository
    Memberships models.MembershipRepository
    Articles    models.ArticleRepository
    Authors     *adapters.PostgresAuthorsRepository
    AuthorsSQLite *adapters.SQLliteAuthorsRepository
    Tags        models.TagsRepository
    Config      *config.Config
    Environment Environment
}
```

### Benefits

1. **Single Responsibility:** main.go focuses on HTTP routing; dependencies.go handles infrastructure
2. **Type Safety:** Full compile-time checks; no reflection or runtime magic
3. **Explicit:** Clear factory functions show exactly what each environment initializes
4. **Testable:** Easy to mock or swap implementations per environment
5. **Zero Dependencies:** No external DI frameworks; pure Go standard library
6. **Self-Documenting:** Code structure maps directly to environment requirements

### Usage Pattern

```go
deps, err := internal.NewDependencies()
if err != nil {
    log.Fatalf("Failed to initialize dependencies: %v", err)
}
defer deps.Close()
```

Environment determined by `APP_ENV` variable:
- `development` → Local PostgreSQL
- `preview` → In-memory SQLite
- `production` → Cloud SQL PostgreSQL
- (unset) → Defaults to `development`

### Developer Experience

Centralized via Makefile:
- `make dev` - Start local development with Docker
- `make test` - Run all tests
- `make build` - Build production binary

### Adding New Dependencies

When adding new repository types:

1. Add field to `Dependencies` struct
2. Initialize in each factory function (`newDevelopmentDeps`, `newPreviewDeps`, `newProductionDeps`)
3. Access via `deps.NewRepository` in main.go

Example:
```go
// internal/dependencies.go
type Dependencies struct {
    // ... existing fields
    Products models.ProductRepository
}

func newDevelopmentDeps(cfg *config.Config, env Environment) (*Dependencies, error) {
    // ... existing setup
    return &Dependencies{
        // ... existing fields
        Products: adapters.NewPostgresProductRepository(db),
    }
}

// cmd/server/main.go
r.GET("/products", handlers.ListProducts(deps.Products))
```

### Future Considerations

- **Feature Flags:** Environment-specific feature toggles can live in Dependencies
- **Observability:** Centralized metrics/tracing initialization per environment
- **Configuration:** Keep config.Load() separate; dependencies consume config rather than manage it
