package models

import "time"

type ProjectTier string

const (
	TierFree    ProjectTier = "free"
	TierPremium ProjectTier = "premium"
)

func (t ProjectTier) IsValid() bool {
	switch t {
	case TierFree, TierPremium:
		return true
	}
	return false
}

type Project struct {
	ID        string
	TenantID  string
	Name      string
	Tier      ProjectTier
	CreatedAt time.Time
}

func NewProject(id, tenantID, name string, tier ProjectTier) *Project {
	return &Project{
		ID:        id,
		TenantID:  tenantID,
		Name:      name,
		Tier:      tier,
		CreatedAt: time.Now(),
	}
}

type ProjectRepository interface {
	Save(project *Project) error
	FindByID(id string) (*Project, error)
	ListByTenant(tenantID string) ([]*Project, error)
	CountByTenant(tenantID string) (int, error)
	UpdateTier(id string, tier ProjectTier) error
	Update(project *Project) error
	Delete(id string) error
}
