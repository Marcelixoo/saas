package adapters

import (
	"database/sql"
	"mini-search-platform/internal/models"
)

type SQLiteUserRepository struct {
	db *sql.DB
}

func NewSQLiteUserRepository(db *sql.DB) *SQLiteUserRepository {
	return &SQLiteUserRepository{db: db}
}

func (r *SQLiteUserRepository) Save(user *models.User) error {
	query := `INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
	_, err := r.db.Exec(query, user.ID, user.Email, user.PasswordHash, user.CreatedAt, user.UpdatedAt)
	return err
}

func (r *SQLiteUserRepository) FindByID(id string) (*models.User, error) {
	query := `SELECT id, email, password_hash, created_at, updated_at FROM users WHERE id = ?`
	user := &models.User{}
	err := r.db.QueryRow(query, id).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *SQLiteUserRepository) FindByEmail(email string) (*models.User, error) {
	query := `SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = ?`
	user := &models.User{}
	err := r.db.QueryRow(query, email).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *SQLiteUserRepository) Update(user *models.User) error {
	query := `UPDATE users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?`
	_, err := r.db.Exec(query, user.Email, user.PasswordHash, user.UpdatedAt, user.ID)
	return err
}
