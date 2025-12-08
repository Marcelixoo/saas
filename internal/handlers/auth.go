package handlers

import (
	"mini-search-platform/internal/models"
	"mini-search-platform/pkg/errors"
	"mini-search-platform/pkg/security"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type RegisterRequest struct {
	Email      string `json:"email" binding:"required,email"`
	Password   string `json:"password" binding:"required,min=8"`
	TenantName string `json:"tenant_name" binding:"required"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type TokenResponse struct {
	AccessToken  string   `json:"access_token"`
	RefreshToken string   `json:"refresh_token"`
	TokenType    string   `json:"token_type"`
	ExpiresIn    int64    `json:"expires_in"`
	User         UserInfo `json:"user"`
}

type UserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func Register(
	userRepo models.UserRepository,
	tenantRepo models.TenantRepository,
	membershipRepo models.MembershipRepository,
	jwtService *security.JWTService,
	accessTTL int64,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RegisterRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		existingUser, err := userRepo.FindByEmail(req.Email)
		if err != nil {
			errors.Handle(c, errors.Database("failed to check existing user", err))
			return
		}
		if existingUser != nil {
			errors.Handle(c, errors.Conflict("email already registered"))
			return
		}

		passwordHash, err := security.HashPassword(req.Password)
		if err != nil {
			errors.Handle(c, errors.Internal("failed to hash password", err))
			return
		}

		userID := uuid.New().String()
		user := models.NewUser(userID, req.Email, passwordHash)

		if err := userRepo.Save(user); err != nil {
			errors.Handle(c, errors.Database("failed to create user", err))
			return
		}

		tenantID := uuid.New().String()
		tenant := models.NewTenant(tenantID, req.TenantName)

		if err := tenantRepo.Save(tenant); err != nil {
			errors.Handle(c, errors.Database("failed to create tenant", err))
			return
		}

		membershipID := uuid.New().String()
		membership := models.NewMembership(membershipID, userID, tenantID, models.RoleAdmin)

		if err := membershipRepo.Save(membership); err != nil {
			errors.Handle(c, errors.Database("failed to create membership", err))
			return
		}

		accessToken, err := jwtService.GenerateToken(userID, req.Email)
		if err != nil {
			errors.Handle(c, errors.Internal("failed to generate token", err))
			return
		}

		refreshToken, err := jwtService.GenerateToken(userID, req.Email)
		if err != nil {
			errors.Handle(c, errors.Internal("failed to generate refresh token", err))
			return
		}

		c.JSON(http.StatusCreated, TokenResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			TokenType:    "Bearer",
			ExpiresIn:    accessTTL,
			User: UserInfo{
				ID:    userID,
				Email: req.Email,
			},
		})
	}
}

func Login(
	userRepo models.UserRepository,
	jwtService *security.JWTService,
	accessTTL int64,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		user, err := userRepo.FindByEmail(req.Email)
		if err != nil {
			errors.Handle(c, errors.Database("failed to find user", err))
			return
		}

		if user == nil {
			errors.Handle(c, errors.Unauthorized("invalid credentials"))
			return
		}

		if err := security.ComparePassword(user.PasswordHash, req.Password); err != nil {
			errors.Handle(c, errors.Unauthorized("invalid credentials"))
			return
		}

		accessToken, err := jwtService.GenerateToken(user.ID, user.Email)
		if err != nil {
			errors.Handle(c, errors.Internal("failed to generate token", err))
			return
		}

		refreshToken, err := jwtService.GenerateToken(user.ID, user.Email)
		if err != nil {
			errors.Handle(c, errors.Internal("failed to generate refresh token", err))
			return
		}

		c.JSON(http.StatusOK, TokenResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			TokenType:    "Bearer",
			ExpiresIn:    accessTTL,
			User: UserInfo{
				ID:    user.ID,
				Email: user.Email,
			},
		})
	}
}

func RefreshToken(jwtService *security.JWTService, accessTTL int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		type RefreshRequest struct {
			RefreshToken string `json:"refresh_token" binding:"required"`
		}

		var req RefreshRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		newAccessToken, err := jwtService.RefreshToken(req.RefreshToken)
		if err != nil {
			errors.Handle(c, errors.Unauthorized("invalid refresh token"))
			return
		}

		claims, _ := jwtService.ValidateToken(newAccessToken)

		c.JSON(http.StatusOK, TokenResponse{
			AccessToken:  newAccessToken,
			RefreshToken: req.RefreshToken,
			TokenType:    "Bearer",
			ExpiresIn:    accessTTL,
			User: UserInfo{
				ID:    claims.UserID,
				Email: claims.Email,
			},
		})
	}
}

func GetCurrentUser(userRepo models.UserRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := security.GetUserID(c)
		if err != nil {
			errors.Handle(c, errors.Unauthorized("authentication required"))
			return
		}

		user, err := userRepo.FindByID(userID)
		if err != nil {
			errors.Handle(c, errors.Database("failed to fetch user", err))
			return
		}

		if user == nil {
			errors.Handle(c, errors.NotFound("user"))
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"id":         user.ID,
			"email":      user.Email,
			"created_at": user.CreatedAt,
		})
	}
}
