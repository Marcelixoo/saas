package adapters

import (
	"database/sql"
	"mini-search-platform/internal/models"
)

type SQLiteTenantRepository struct {
	db *sql.DB
}

func NewSQLiteTenantRepository(db *sql.DB) *SQLiteTenantRepository {
	return &SQLiteTenantRepository{db: db}
}

func (r *SQLiteTenantRepository) Save(tenant *models.Tenant) error {
	query := `INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)`
	_, err := r.db.Exec(query, tenant.ID, tenant.Name, tenant.CreatedAt)
	return err
}

func (r *SQLiteTenantRepository) FindByID(id string) (*models.Tenant, error) {
	query := `SELECT id, name, created_at FROM tenants WHERE id = ?`
	tenant := &models.Tenant{}
	err := r.db.QueryRow(query, id).Scan(&tenant.ID, &tenant.Name, &tenant.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return tenant, nil
}

func (r *SQLiteTenantRepository) ListByUserID(userID string) ([]*models.Tenant, error) {
	query := `
		SELECT t.id, t.name, t.created_at
		FROM tenants t
		INNER JOIN memberships m ON t.id = m.tenant_id
		WHERE m.user_id = ?
		ORDER BY t.created_at DESC
	`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []*models.Tenant
	for rows.Next() {
		tenant := &models.Tenant{}
		if err := rows.Scan(&tenant.ID, &tenant.Name, &tenant.CreatedAt); err != nil {
			return nil, err
		}
		tenants = append(tenants, tenant)
	}

	return tenants, rows.Err()
}

func (r *SQLiteTenantRepository) Update(tenant *models.Tenant) error {
	query := `UPDATE tenants SET name = ? WHERE id = ?`
	_, err := r.db.Exec(query, tenant.Name, tenant.ID)
	return err
}

func (r *SQLiteTenantRepository) Delete(id string) error {
	query := `DELETE FROM tenants WHERE id = ?`
	_, err := r.db.Exec(query, id)
	return err
}
