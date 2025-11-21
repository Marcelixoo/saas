package security

import (
	"errors"
	"mini-search-platform/internal/models"

	"github.com/gin-gonic/gin"
)

const (
	ContextKeyUserID   = "user_id"
	ContextKeyEmail    = "email"
	ContextKeyTenantID = "tenant_id"
	ContextKeyRole     = "role"
)

var (
	ErrUserIDNotFound   = errors.New("user ID not found in context")
	ErrEmailNotFound    = errors.New("email not found in context")
	ErrTenantIDNotFound = errors.New("tenant ID not found in context")
	ErrRoleNotFound     = errors.New("role not found in context")
)

func SetUserContext(c *gin.Context, userID, email string) {
	c.Set(ContextKeyUserID, userID)
	c.Set(ContextKeyEmail, email)
}

func SetTenantContext(c *gin.Context, tenantID string, role models.Role) {
	c.Set(ContextKeyTenantID, tenantID)
	c.Set(ContextKeyRole, string(role))
}

func GetUserID(c *gin.Context) (string, error) {
	value, exists := c.Get(ContextKeyUserID)
	if !exists {
		return "", ErrUserIDNotFound
	}
	userID, ok := value.(string)
	if !ok {
		return "", ErrUserIDNotFound
	}
	return userID, nil
}

func GetUserEmail(c *gin.Context) (string, error) {
	value, exists := c.Get(ContextKeyEmail)
	if !exists {
		return "", ErrEmailNotFound
	}
	email, ok := value.(string)
	if !ok {
		return "", ErrEmailNotFound
	}
	return email, nil
}

func GetTenantID(c *gin.Context) (string, error) {
	value, exists := c.Get(ContextKeyTenantID)
	if !exists {
		return "", ErrTenantIDNotFound
	}
	tenantID, ok := value.(string)
	if !ok {
		return "", ErrTenantIDNotFound
	}
	return tenantID, nil
}

func GetRole(c *gin.Context) (models.Role, error) {
	value, exists := c.Get(ContextKeyRole)
	if !exists {
		return "", ErrRoleNotFound
	}
	roleStr, ok := value.(string)
	if !ok {
		return "", ErrRoleNotFound
	}
	return models.Role(roleStr), nil
}

func MustGetUserID(c *gin.Context) string {
	userID, _ := GetUserID(c)
	return userID
}

func MustGetUserEmail(c *gin.Context) string {
	email, _ := GetUserEmail(c)
	return email
}

func MustGetTenantID(c *gin.Context) string {
	tenantID, _ := GetTenantID(c)
	return tenantID
}

func MustGetRole(c *gin.Context) models.Role {
	role, _ := GetRole(c)
	return role
}
