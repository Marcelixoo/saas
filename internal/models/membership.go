package models

import "time"

type Role string

const (
	RoleAdmin   Role = "admin"
	RoleBilling Role = "billing"
	RoleMember  Role = "member"
)

func (r Role) IsValid() bool {
	switch r {
	case RoleAdmin, RoleBilling, RoleMember:
		return true
	}
	return false
}

type Membership struct {
	ID        string
	UserID    string
	TenantID  string
	Role      Role
	CreatedAt time.Time
}

func NewMembership(id, userID, tenantID string, role Role) *Membership {
	return &Membership{
		ID:        id,
		UserID:    userID,
		TenantID:  tenantID,
		Role:      role,
		CreatedAt: time.Now(),
	}
}

type MembershipRepository interface {
	Save(membership *Membership) error
	FindByID(id string) (*Membership, error)
	FindByUserAndTenant(userID, tenantID string) (*Membership, error)
	ListByUser(userID string) ([]*Membership, error)
	ListByTenant(tenantID string) ([]*Membership, error)
	UpdateRole(id string, role Role) error
	Delete(id string) error
}
