package adapters

import (
	"database/sql"
	"mini-search-platform/internal/models"
)

type PostgresMembershipRepository struct {
	db *sql.DB
}

func NewPostgresMembershipRepository(db *sql.DB) *PostgresMembershipRepository {
	return &PostgresMembershipRepository{db: db}
}

func (r *PostgresMembershipRepository) Save(membership *models.Membership) error {
	query := `INSERT INTO memberships (id, user_id, tenant_id, role, created_at) VALUES ($1, $2, $3, $4, $5)`
	_, err := r.db.Exec(query, membership.ID, membership.UserID, membership.TenantID, membership.Role, membership.CreatedAt)
	return err
}

func (r *PostgresMembershipRepository) FindByID(id string) (*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE id = $1`
	membership := &models.Membership{}
	err := r.db.QueryRow(query, id).Scan(&membership.ID, &membership.UserID, &membership.TenantID, &membership.Role, &membership.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return membership, nil
}

func (r *PostgresMembershipRepository) FindByUserAndTenant(userID, tenantID string) (*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE user_id = $1 AND tenant_id = $2`
	membership := &models.Membership{}
	err := r.db.QueryRow(query, userID, tenantID).Scan(&membership.ID, &membership.UserID, &membership.TenantID, &membership.Role, &membership.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return membership, nil
}

func (r *PostgresMembershipRepository) ListByUser(userID string) ([]*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var memberships []*models.Membership
	for rows.Next() {
		membership := &models.Membership{}
		if err := rows.Scan(&membership.ID, &membership.UserID, &membership.TenantID, &membership.Role, &membership.CreatedAt); err != nil {
			return nil, err
		}
		memberships = append(memberships, membership)
	}

	return memberships, rows.Err()
}

func (r *PostgresMembershipRepository) ListByTenant(tenantID string) ([]*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE tenant_id = $1 ORDER BY created_at DESC`
	rows, err := r.db.Query(query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var memberships []*models.Membership
	for rows.Next() {
		membership := &models.Membership{}
		if err := rows.Scan(&membership.ID, &membership.UserID, &membership.TenantID, &membership.Role, &membership.CreatedAt); err != nil {
			return nil, err
		}
		memberships = append(memberships, membership)
	}

	return memberships, rows.Err()
}

func (r *PostgresMembershipRepository) UpdateRole(id string, role models.Role) error {
	query := `UPDATE memberships SET role = $1 WHERE id = $2`
	_, err := r.db.Exec(query, role, id)
	return err
}

func (r *PostgresMembershipRepository) Delete(id string) error {
	query := `DELETE FROM memberships WHERE id = $1`
	_, err := r.db.Exec(query, id)
	return err
}
