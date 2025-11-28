package models

import "time"

type Tenant struct {
	ID        string
	Name      string
	CreatedAt time.Time
}

func NewTenant(id, name string) *Tenant {
	return &Tenant{
		ID:        id,
		Name:      name,
		CreatedAt: time.Now(),
	}
}

type TenantRepository interface {
	Save(tenant *Tenant) error
	FindByID(id string) (*Tenant, error)
	ListByUserID(userID string) ([]*Tenant, error)
	Update(tenant *Tenant) error
	Delete(id string) error
}
