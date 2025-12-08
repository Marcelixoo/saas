package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
)

const (
	SeverityDefault   = "DEFAULT"
	SeverityDebug     = "DEBUG"
	SeverityInfo      = "INFO"
	SeverityNotice    = "NOTICE"
	SeverityWarning   = "WARNING"
	SeverityError     = "ERROR"
	SeverityCritical  = "CRITICAL"
	SeverityAlert     = "ALERT"
	SeverityEmergency = "EMERGENCY"
)

var defaultLogger *slog.Logger

func Init() {
	defaultLogger = NewCloudLogger(os.Stdout)
}

func NewCloudLogger(w io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{
		Level: slog.LevelDebug,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// Map slog levels to Cloud Logging severity
			if a.Key == slog.LevelKey {
				level := a.Value.Any().(slog.Level)
				var severity string
				switch {
				case level < slog.LevelInfo:
					severity = SeverityDebug
				case level < slog.LevelWarn:
					severity = SeverityInfo
				case level < slog.LevelError:
					severity = SeverityWarning
				default:
					severity = SeverityError
				}
				return slog.String("severity", severity)
			}
			return a
		},
	}))
}

func Logger() *slog.Logger {
	if defaultLogger == nil {
		Init()
	}
	return defaultLogger
}

func Debug(msg string, args ...any) {
	Logger().Debug(msg, args...)
}

func Info(msg string, args ...any) {
	Logger().Info(msg, args...)
}

func Warn(msg string, args ...any) {
	Logger().Warn(msg, args...)
}

func Error(msg string, args ...any) {
	Logger().Error(msg, args...)
}

func Critical(msg string, args ...any) {
	Logger().Error(msg, append(args, slog.String("severity", SeverityCritical))...)
}

func WithContext(ctx context.Context) *slog.Logger {
	logger := Logger()

	if requestID := GetRequestID(ctx); requestID != "" {
		logger = logger.With(slog.String("request_id", requestID))
	}

	if userID := ctx.Value(contextKeyUserID); userID != nil {
		logger = logger.With(slog.String("user_id", userID.(string)))
	}

	if tenantID := ctx.Value(contextKeyTenantID); tenantID != nil {
		logger = logger.With(slog.String("tenant_id", tenantID.(string)))
	}

	return logger
}
