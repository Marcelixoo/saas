package errors

import (
	"fmt"
	"net/http"
)

// ErrorCode represents a unique error code for the application
type ErrorCode string

const (
	// Client errors (4xx)
	ErrCodeValidation   ErrorCode = "VALIDATION_ERROR"
	ErrCodeUnauthorized ErrorCode = "UNAUTHORIZED"
	ErrCodeForbidden    ErrorCode = "FORBIDDEN"
	ErrCodeNotFound     ErrorCode = "NOT_FOUND"
	ErrCodeConflict     ErrorCode = "CONFLICT"
	ErrCodeRateLimited  ErrorCode = "RATE_LIMITED"

	// Server errors (5xx)
	ErrCodeDatabase ErrorCode = "DATABASE_ERROR"
	ErrCodeSearch   ErrorCode = "SEARCH_ERROR"
	ErrCodeInternal ErrorCode = "INTERNAL_ERROR"
)

// AppError represents a structured application error
type AppError struct {
	Code       ErrorCode              `json:"code"`
	Message    string                 `json:"message"`
	Details    map[string]interface{} `json:"details,omitempty"`
	StatusCode int                    `json:"-"`
	Err        error                  `json:"-"`
}

// Error implements the error interface
func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap returns the underlying error
func (e *AppError) Unwrap() error {
	return e.Err
}

// NewAppError creates a new application error
func NewAppError(code ErrorCode, message string, statusCode int) *AppError {
	return &AppError{
		Code:       code,
		Message:    message,
		StatusCode: statusCode,
	}
}

// WithDetails adds details to the error
func (e *AppError) WithDetails(details map[string]interface{}) *AppError {
	e.Details = details
	return e
}

// WithError wraps an underlying error
func (e *AppError) WithError(err error) *AppError {
	e.Err = err
	return e
}

// Predefined errors for common cases

// Validation creates a validation error
func Validation(message string) *AppError {
	return NewAppError(ErrCodeValidation, message, http.StatusBadRequest)
}

// Unauthorized creates an unauthorized error
func Unauthorized(message string) *AppError {
	return NewAppError(ErrCodeUnauthorized, message, http.StatusUnauthorized)
}

// Forbidden creates a forbidden error
func Forbidden(message string) *AppError {
	return NewAppError(ErrCodeForbidden, message, http.StatusForbidden)
}

// NotFound creates a not found error
func NotFound(resource string) *AppError {
	return NewAppError(
		ErrCodeNotFound,
		fmt.Sprintf("%s not found", resource),
		http.StatusNotFound,
	)
}

// Conflict creates a conflict error
func Conflict(message string) *AppError {
	return NewAppError(ErrCodeConflict, message, http.StatusConflict)
}

// RateLimited creates a rate limited error
func RateLimited(message string) *AppError {
	return NewAppError(ErrCodeRateLimited, message, http.StatusTooManyRequests)
}

// Database creates a database error
func Database(message string, err error) *AppError {
	return NewAppError(
		ErrCodeDatabase,
		message,
		http.StatusInternalServerError,
	).WithError(err)
}

// Search creates a search engine error
func Search(message string, err error) *AppError {
	return NewAppError(
		ErrCodeSearch,
		message,
		http.StatusInternalServerError,
	).WithError(err)
}

// Internal creates an internal server error
func Internal(message string, err error) *AppError {
	return NewAppError(
		ErrCodeInternal,
		message,
		http.StatusInternalServerError,
	).WithError(err)
}
