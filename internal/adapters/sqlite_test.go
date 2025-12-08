package adapters

import (
	"database/sql"
	"mini-search-platform/internal/database"
	"mini-search-platform/internal/models"
	"mini-search-platform/pkg/sqlite"
	"testing"
)

func setupTestSQLiteDB(t *testing.T) *sql.DB {
	db, err := sqlite.Init("file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("Failed to initialize SQLite: %v", err)
	}

	if err := database.Create(db); err != nil {
		t.Fatalf("Failed to create schema: %v", err)
	}

	return db
}

func TestSQLiteAuthorsRepository_SaveAndFind(t *testing.T) {
	db := setupTestSQLiteDB(t)
	defer db.Close()

	repo := NewSQLliteAuthorsRepository(db)

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

func TestSQLiteUserRepository_SaveAndFindByEmail(t *testing.T) {
	db := setupTestSQLiteDB(t)
	defer db.Close()

	repo := NewSQLiteUserRepository(db)

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

func TestSQLiteTenantRepository_SaveAndFindByID(t *testing.T) {
	db := setupTestSQLiteDB(t)
	defer db.Close()

	repo := NewSQLiteTenantRepository(db)

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

func TestSQLiteTagsRepository_SaveAndFindByLabel(t *testing.T) {
	db := setupTestSQLiteDB(t)
	defer db.Close()

	repo := NewSQLliteTagsRepository(db)

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

func TestSQLiteArticleRepository_Save(t *testing.T) {
	db := setupTestSQLiteDB(t)
	defer db.Close()

	authorsRepo := NewSQLliteAuthorsRepository(db)
	tagsRepo := NewSQLliteTagsRepository(db)
	articlesRepo := NewSQLliteArticleRepository(db)

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
