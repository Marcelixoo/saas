package internal

import (
	"database/sql"
	"fmt"
	"log"
	"mini-search-platform/config"
	"mini-search-platform/internal/adapters"
	"mini-search-platform/internal/database"
	"mini-search-platform/internal/models"
	"mini-search-platform/pkg/postgres"
	"mini-search-platform/pkg/sqlite"
	"os"
)

type Environment string

const (
	Development Environment = "development"
	Preview     Environment = "preview"
	Production  Environment = "production"
)

type AuthorsRepository interface {
	Save(*models.Author) (int, error)
	FindAuthorById(int) (*models.Author, error)
}

type Dependencies struct {
	DB          *sql.DB
	Users       models.UserRepository
	Tenants     models.TenantRepository
	Memberships models.MembershipRepository
	Articles    models.ArticleRepository
	Authors     AuthorsRepository
	Tags        models.TagsRepository
	Config      *config.Config
	Environment Environment
}

func NewDependencies() (*Dependencies, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}

	env := Environment(os.Getenv("APP_ENV"))
	if env == "" {
		env = Development
	}

	log.Printf("Initializing dependencies for environment: %s", env)

	switch env {
	case Development:
		return newDevelopmentDeps(cfg, env)
	case Preview:
		return newPreviewDeps(cfg, env)
	case Production:
		return newProductionDeps(cfg, env)
	default:
		return newDevelopmentDeps(cfg, env)
	}
}

func newDevelopmentDeps(cfg *config.Config, env Environment) (*Dependencies, error) {
	dbURL := getEnvOrDefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/fashiondb?sslmode=disable")

	db, err := postgres.Init(dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}

	if err := database.CreatePostgres(db); err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	log.Println("Using PostgreSQL (local Docker)")

	return &Dependencies{
		DB:          db,
		Users:       adapters.NewPostgresUserRepository(db),
		Tenants:     adapters.NewPostgresTenantRepository(db),
		Memberships: adapters.NewPostgresMembershipRepository(db),
		Articles:    adapters.NewPostgresArticleRepository(db),
		Authors:     adapters.NewPostgresAuthorsRepository(db),
		Tags:        adapters.NewPostgresTagsRepository(db),
		Config:      cfg,
		Environment: env,
	}, nil
}

func newPreviewDeps(cfg *config.Config, env Environment) (*Dependencies, error) {
	db, err := sqlite.Init("file::memory:?cache=shared")
	if err != nil {
		return nil, fmt.Errorf("failed to initialize SQLite: %w", err)
	}

	if err := database.Create(db); err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	log.Println("Using SQLite (in-memory)")

	return &Dependencies{
		DB:          db,
		Users:       adapters.NewSQLiteUserRepository(db),
		Tenants:     adapters.NewSQLiteTenantRepository(db),
		Memberships: adapters.NewSQLiteMembershipRepository(db),
		Articles:    adapters.NewSQLliteArticleRepository(db),
		Authors:     adapters.NewSQLliteAuthorsRepository(db),
		Tags:        adapters.NewSQLliteTagsRepository(db),
		Config:      cfg,
		Environment: env,
	}, nil
}

func newProductionDeps(cfg *config.Config, env Environment) (*Dependencies, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL required in production")
	}

	db, err := postgres.Init(dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Cloud SQL: %w", err)
	}

	if err := database.CreatePostgres(db); err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	log.Println("Using PostgreSQL (Cloud SQL)")

	return &Dependencies{
		DB:          db,
		Users:       adapters.NewPostgresUserRepository(db),
		Tenants:     adapters.NewPostgresTenantRepository(db),
		Memberships: adapters.NewPostgresMembershipRepository(db),
		Articles:    adapters.NewPostgresArticleRepository(db),
		Authors:     adapters.NewPostgresAuthorsRepository(db),
		Tags:        adapters.NewPostgresTagsRepository(db),
		Config:      cfg,
		Environment: env,
	}, nil
}

func (d *Dependencies) Close() error {
	if d.DB != nil {
		return d.DB.Close()
	}
	return nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
