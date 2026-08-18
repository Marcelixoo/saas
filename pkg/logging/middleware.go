package logging

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestLogger is a Gin middleware that logs a single structured event per request
// It captures the full request lifecycle including timing, status, errors, and context
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := GenerateRequestID()
		SetRequestID(c, requestID)

		startTime := time.Now()

		writer := &responseWriter{
			ResponseWriter: c.Writer,
			statusCode:     200,
		}
		c.Writer = writer

		c.Next()

		duration := time.Since(startTime)

		statusCode := writer.statusCode
		var logLevel slog.Level
		switch {
		case statusCode >= 500:
			logLevel = slog.LevelError
		case statusCode >= 400:
			logLevel = slog.LevelWarn
		default:
			logLevel = slog.LevelInfo
		}

		attrs := []any{
			slog.String("request_id", requestID),
			slog.Group("httpRequest",
				slog.String("requestMethod", c.Request.Method),
				slog.String("requestUrl", c.Request.URL.String()),
				slog.Int("status", statusCode),
				slog.String("userAgent", c.Request.UserAgent()),
				slog.String("remoteIp", c.ClientIP()),
				slog.String("latency", duration.String()),
			),
			// latency_ms is kept as a top-level numeric field (in addition to
			// the human-readable httpRequest.latency string above) so a Cloud
			// Logging log-based metric can extract it as a distribution value
			// directly via jsonPayload.latency_ms, without parsing a Go
			// duration string. Combined with tenant_id below, this is the
			// minimal signal needed to build a per-tenant latency SLI — see
			// docs/observability.md ("Per-tenant SLAs").
			slog.Int64("latency_ms", duration.Milliseconds()),
		}

		if userID := GetUserID(c); userID != "" {
			attrs = append(attrs, slog.String("user_id", userID))
		}

		if tenantID := GetTenantID(c); tenantID != "" {
			attrs = append(attrs, slog.String("tenant_id", tenantID))
		}

		if err := GetError(c); err != nil {
			attrs = append(attrs, slog.Group("error",
				slog.String("message", err.Error()),
			))
		}

		Logger().Log(c.Request.Context(), logLevel, "request completed", attrs...)
	}
}

// responseWriter wraps gin.ResponseWriter to capture status code
type responseWriter struct {
	gin.ResponseWriter
	statusCode int
}

func (w *responseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseWriter) Write(data []byte) (int, error) {
	return w.ResponseWriter.Write(data)
}
