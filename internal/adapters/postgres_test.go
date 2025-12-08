package adapters

import (
	"database/sql"
	"mini-search-platform/internal/database"
	"mini-search-platform/internal/models"
	"mini-search-platform/pkg/postgres"
	"os"
	"testing"
)

func setupTestDB(t *testing.T) *sql.DB {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://postgres:postgres@localhost:5432/fashiondb_test?sslmode=disable"
	}

	db, err := postgres.Init(dbURL)
	if err != nil {
		t.Skipf("Skipping test: PostgreSQL not available: %v", err)
		return nil
	}

	if err := database.CreatePostgres(db); err != nil {
		t.Skipf("Skipping test: Failed to create schema: %v", err)
		return nil
	}

	return db
}

func TestPostgresAuthorsRepository_SaveAndFind(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewPostgresAuthorsRepository(db)

	author := models.NewAuthor(1, "John Doe")
	id, err := repo.Save(author)
	if err != nil {
		t.Fatalf("Failed to save author: %v", err)
	}

	if id == 0 {
		t.Error("Expected non-zero ID")
	}

	found, err := repo.FindAuthorById(id)
	if err != nil {
		t.Fatalf("Failed to find author: %v", err)
	}

	if found.Name != author.Name {
		t.Errorf("Expected name %s, got %s", author.Name, found.Name)
	}
}

func TestPostgresUserRepository_SaveAndFindByEmail(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewPostgresUserRepository(db)

	user := models.NewUser("test-user-id", "test@example.com", "hashed_password")

	err := repo.Save(user)
	if err != nil {
		t.Fatalf("Failed to save user: %v", err)
	}

	found, err := repo.FindByEmail(user.Email)
	if err != nil {
		t.Fatalf("Failed to find user: %v", err)
	}

	if found.Email != user.Email {
		t.Errorf("Expected email %s, got %s", user.Email, found.Email)
	}
}

func TestPostgresTenantRepository_SaveAndFindByID(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewPostgresTenantRepository(db)

	tenant := models.NewTenant("test-tenant-id", "Test Tenant")

	err := repo.Save(tenant)
	if err != nil {
		t.Fatalf("Failed to save tenant: %v", err)
	}

	if tenant.ID == "" {
		t.Error("Expected non-empty tenant ID")
	}

	found, err := repo.FindByID(tenant.ID)
	if err != nil {
		t.Fatalf("Failed to find tenant: %v", err)
	}

	if found.Name != tenant.Name {
		t.Errorf("Expected name %s, got %s", tenant.Name, found.Name)
	}
}

func TestPostgresTagsRepository_SaveAndFindByLabel(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewPostgresTagsRepository(db)

	tag := models.NewTag("golang")
	id, err := repo.Save(tag)
	if err != nil {
		t.Fatalf("Failed to save tag: %v", err)
	}

	if id == 0 {
		t.Error("Expected non-zero ID")
	}

	found, err := repo.FindByLabel("golang")
	if err != nil {
		t.Fatalf("Failed to find tag: %v", err)
	}

	if found.Label != tag.Label {
		t.Errorf("Expected label %s, got %s", tag.Label, found.Label)
	}
}

func TestPostgresArticleRepository_Save(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	authorsRepo := NewPostgresAuthorsRepository(db)
	tagsRepo := NewPostgresTagsRepository(db)
	articlesRepo := NewPostgresArticleRepository(db)

	author := models.NewAuthor(2, "Jane Smith")
	_, err := authorsRepo.Save(author)
	if err != nil {
		t.Fatalf("Failed to save author: %v", err)
	}

	tag := models.NewTag("testing")
	tagID, err := tagsRepo.Save(tag)
	if err != nil {
		t.Fatalf("Failed to save tag: %v", err)
	}
	tag.ID = tagID

	article := models.NewArticle("Test Article", "Test body", author, []*models.Tag{tag})

	id, err := articlesRepo.Save(article)
	if err != nil {
		t.Fatalf("Failed to save article: %v", err)
	}

	if id == 0 {
		t.Error("Expected non-zero article ID")
	}
}
