package adapters

import (
	"database/sql"
	"mini-search-platform/internal/models"
)

type SQLiteProjectRepository struct {
	db *sql.DB
}

func NewSQLiteProjectRepository(db *sql.DB) *SQLiteProjectRepository {
	return &SQLiteProjectRepository{db: db}
}

func (r *SQLiteProjectRepository) Save(project *models.Project) error {
	query := `INSERT INTO projects (id, tenant_id, name, tier, created_at) VALUES (?, ?, ?, ?, ?)`
	_, err := r.db.Exec(query, project.ID, project.TenantID, project.Name, project.Tier, project.CreatedAt)
	return err
}

func (r *SQLiteProjectRepository) FindByID(id string) (*models.Project, error) {
	query := `SELECT id, tenant_id, name, tier, created_at FROM projects WHERE id = ?`
	project := &models.Project{}
	err := r.db.QueryRow(query, id).Scan(&project.ID, &project.TenantID, &project.Name, &project.Tier, &project.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return project, nil
}

func (r *SQLiteProjectRepository) ListByTenant(tenantID string) ([]*models.Project, error) {
	query := `SELECT id, tenant_id, name, tier, created_at FROM projects WHERE tenant_id = ? ORDER BY created_at DESC`
	rows, err := r.db.Query(query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []*models.Project
	for rows.Next() {
		project := &models.Project{}
		if err := rows.Scan(&project.ID, &project.TenantID, &project.Name, &project.Tier, &project.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}

	return projects, rows.Err()
}

func (r *SQLiteProjectRepository) CountByTenant(tenantID string) (int, error) {
	query := `SELECT COUNT(*) FROM projects WHERE tenant_id = ?`
	var count int
	err := r.db.QueryRow(query, tenantID).Scan(&count)
	return count, err
}

func (r *SQLiteProjectRepository) UpdateTier(id string, tier models.ProjectTier) error {
	query := `UPDATE projects SET tier = ? WHERE id = ?`
	_, err := r.db.Exec(query, tier, id)
	return err
}

func (r *SQLiteProjectRepository) Update(project *models.Project) error {
	query := `UPDATE projects SET name = ?, tier = ? WHERE id = ?`
	_, err := r.db.Exec(query, project.Name, project.Tier, project.ID)
	return err
}

func (r *SQLiteProjectRepository) Delete(id string) error {
	query := `DELETE FROM projects WHERE id = ?`
	_, err := r.db.Exec(query, id)
	return err
}
