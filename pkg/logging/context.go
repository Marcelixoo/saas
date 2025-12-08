package logging

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type contextKey string

const (
	contextKeyRequestID contextKey = "request_id"
	contextKeyUserID    contextKey = "user_id"
	contextKeyTenantID  contextKey = "tenant_id"
	contextKeyError     contextKey = "request_error"
)

// SetRequestID sets the request ID in the context
func SetRequestID(c *gin.Context, requestID string) {
	c.Set(string(contextKeyRequestID), requestID)
}

// GetRequestID retrieves the request ID from the context
func GetRequestID(ctx context.Context) string {
	if ginCtx, ok := ctx.(*gin.Context); ok {
		if requestID, exists := ginCtx.Get(string(contextKeyRequestID)); exists {
			return requestID.(string)
		}
	}
	if requestID := ctx.Value(contextKeyRequestID); requestID != nil {
		return requestID.(string)
	}
	return ""
}

// GenerateRequestID generates a new unique request ID
func GenerateRequestID() string {
	return "req_" + uuid.New().String()
}

// SetError stores an error in the request context for later logging
func SetError(c *gin.Context, err error) {
	c.Set(string(contextKeyError), err)
}

// GetError retrieves the error from the request context
func GetError(c *gin.Context) error {
	if err, exists := c.Get(string(contextKeyError)); exists {
		if e, ok := err.(error); ok {
			return e
		}
	}
	return nil
}

// GetUserID retrieves the user ID from the context (if set by auth middleware)
func GetUserID(c *gin.Context) string {
	if userID, exists := c.Get("user_id"); exists {
		return userID.(string)
	}
	return ""
}

// GetTenantID retrieves the tenant ID from the context (if set by auth middleware)
func GetTenantID(c *gin.Context) string {
	if tenantID, exists := c.Get("tenant_id"); exists {
		return tenantID.(string)
	}
	return ""
}
