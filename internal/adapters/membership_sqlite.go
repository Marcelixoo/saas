package adapters

import (
	"database/sql"
	"mini-search-platform/internal/models"
)

type SQLiteMembershipRepository struct {
	db *sql.DB
}

func NewSQLiteMembershipRepository(db *sql.DB) *SQLiteMembershipRepository {
	return &SQLiteMembershipRepository{db: db}
}

func (r *SQLiteMembershipRepository) Save(membership *models.Membership) error {
	query := `INSERT INTO memberships (id, user_id, tenant_id, role, created_at) VALUES (?, ?, ?, ?, ?)`
	_, err := r.db.Exec(query, membership.ID, membership.UserID, membership.TenantID, membership.Role, membership.CreatedAt)
	return err
}

func (r *SQLiteMembershipRepository) FindByID(id string) (*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE id = ?`
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

func (r *SQLiteMembershipRepository) FindByUserAndTenant(userID, tenantID string) (*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE user_id = ? AND tenant_id = ?`
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

func (r *SQLiteMembershipRepository) ListByUser(userID string) ([]*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE user_id = ? ORDER BY created_at DESC`
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

func (r *SQLiteMembershipRepository) ListByTenant(tenantID string) ([]*models.Membership, error) {
	query := `SELECT id, user_id, tenant_id, role, created_at FROM memberships WHERE tenant_id = ? ORDER BY created_at DESC`
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

func (r *SQLiteMembershipRepository) UpdateRole(id string, role models.Role) error {
	query := `UPDATE memberships SET role = ? WHERE id = ?`
	_, err := r.db.Exec(query, role, id)
	return err
}

func (r *SQLiteMembershipRepository) Delete(id string) error {
	query := `DELETE FROM memberships WHERE id = ?`
	_, err := r.db.Exec(query, id)
	return err
}
