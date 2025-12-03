package middleware

import (
	"mini-search-platform/internal/models"
	"mini-search-platform/pkg/security"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type AuthMiddleware struct {
	jwtService *security.JWTService
	userRepo   models.UserRepository
}

func NewAuthMiddleware(jwtService *security.JWTService, userRepo models.UserRepository) *AuthMiddleware {
	return &AuthMiddleware{
		jwtService: jwtService,
		userRepo:   userRepo,
	}
}

func (m *AuthMiddleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization token"})
			c.Abort()
			return
		}

		claims, err := m.jwtService.ValidateToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}

		user, err := m.userRepo.FindByID(claims.UserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify user"})
			c.Abort()
			return
		}

		if user == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			c.Abort()
			return
		}

		security.SetUserContext(c, user.ID, user.Email)

		if claims.TenantID != "" {
			c.Set(security.ContextKeyTenantID, claims.TenantID)
		}

		c.Next()
	}
}

func (m *AuthMiddleware) OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.Next()
			return
		}

		claims, err := m.jwtService.ValidateToken(token)
		if err != nil {
			c.Next()
			return
		}

		user, err := m.userRepo.FindByID(claims.UserID)
		if err != nil || user == nil {
			c.Next()
			return
		}

		security.SetUserContext(c, user.ID, user.Email)

		if claims.TenantID != "" {
			c.Set(security.ContextKeyTenantID, claims.TenantID)
		}

		c.Next()
	}
}

func (m *AuthMiddleware) RequireTenant(membershipRepo models.MembershipRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := security.GetUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}

		tenantID := c.Param("tenantID")
		if tenantID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tenant ID required"})
			c.Abort()
			return
		}

		membership, err := membershipRepo.FindByUserAndTenant(userID, tenantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify tenant access"})
			c.Abort()
			return
		}

		if membership == nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied to this tenant"})
			c.Abort()
			return
		}

		security.SetTenantContext(c, tenantID, membership.Role)

		c.Next()
	}
}

func extractToken(c *gin.Context) string {
	bearerToken := c.GetHeader("Authorization")
	if bearerToken == "" {
		return ""
	}

	parts := strings.SplitN(bearerToken, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return ""
	}

	return parts[1]
}
