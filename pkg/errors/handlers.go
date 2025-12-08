package errors

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"mini-search-platform/pkg/logging"
)

// ErrorResponse is the standard error response structure
type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail contains error information
type ErrorDetail struct {
	Code    ErrorCode              `json:"code"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

// Handle processes an error and sends an appropriate JSON response
// It also stores the error in the context for the logging middleware
func Handle(c *gin.Context, err error) {
	if err == nil {
		return
	}

	// Store error for logging middleware
	logging.SetError(c, err)

	// Check if it's an AppError
	var appErr *AppError
	if errors.As(err, &appErr) {
		c.JSON(appErr.StatusCode, ErrorResponse{
			Error: ErrorDetail{
				Code:    appErr.Code,
				Message: appErr.Message,
				Details: appErr.Details,
			},
		})
		return
	}

	// Handle standard errors as internal errors
	c.JSON(http.StatusInternalServerError, ErrorResponse{
		Error: ErrorDetail{
			Code:    ErrCodeInternal,
			Message: "An unexpected error occurred",
		},
	})
}

// Abort stops the request processing chain and handles the error
func Abort(c *gin.Context, err error) {
	Handle(c, err)
	c.Abort()
}

// AbortWithError creates and handles a new AppError
func AbortWithError(c *gin.Context, code ErrorCode, message string, statusCode int) {
	Abort(c, NewAppError(code, message, statusCode))
}
