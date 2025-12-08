package adapters

import (
	"database/sql"
	"mini-search-platform/internal/models"
)

type PostgresUserRepository struct {
	db *sql.DB
}

func NewPostgresUserRepository(db *sql.DB) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

func (r *PostgresUserRepository) Save(user *models.User) error {
	query := `INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`
	_, err := r.db.Exec(query, user.ID, user.Email, user.PasswordHash, user.CreatedAt, user.UpdatedAt)
	return err
}

func (r *PostgresUserRepository) FindByID(id string) (*models.User, error) {
	query := `SELECT id, email, password_hash, created_at, updated_at FROM users WHERE id = $1`
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

func (r *PostgresUserRepository) FindByEmail(email string) (*models.User, error) {
	query := `SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = $1`
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

func (r *PostgresUserRepository) Update(user *models.User) error {
	query := `UPDATE users SET email = $1, password_hash = $2, updated_at = $3 WHERE id = $4`
	_, err := r.db.Exec(query, user.Email, user.PasswordHash, user.UpdatedAt, user.ID)
	return err
}
