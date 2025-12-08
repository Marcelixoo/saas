package adapters

import (
	"database/sql"
	"mini-search-platform/internal/models"
)

type PostgresTenantRepository struct {
	db *sql.DB
}

func NewPostgresTenantRepository(db *sql.DB) *PostgresTenantRepository {
	return &PostgresTenantRepository{db: db}
}

func (r *PostgresTenantRepository) Save(tenant *models.Tenant) error {
	query := `INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)`
	_, err := r.db.Exec(query, tenant.ID, tenant.Name, tenant.CreatedAt)
	return err
}

func (r *PostgresTenantRepository) FindByID(id string) (*models.Tenant, error) {
	query := `SELECT id, name, created_at FROM tenants WHERE id = $1`
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

func (r *PostgresTenantRepository) ListByUserID(userID string) ([]*models.Tenant, error) {
	query := `
		SELECT t.id, t.name, t.created_at
		FROM tenants t
		INNER JOIN memberships m ON t.id = m.tenant_id
		WHERE m.user_id = $1
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

func (r *PostgresTenantRepository) Update(tenant *models.Tenant) error {
	query := `UPDATE tenants SET name = $1 WHERE id = $2`
	_, err := r.db.Exec(query, tenant.Name, tenant.ID)
	return err
}

func (r *PostgresTenantRepository) Delete(id string) error {
	query := `DELETE FROM tenants WHERE id = $1`
	_, err := r.db.Exec(query, id)
	return err
}
