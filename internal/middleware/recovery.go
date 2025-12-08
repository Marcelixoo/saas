package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"mini-search-platform/pkg/errors"
	"mini-search-platform/pkg/logging"

	"github.com/gin-gonic/gin"
)

// Recovery is a middleware that recovers from panics and logs them with stack traces
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {

				stackTrace := string(debug.Stack())

				appErr := errors.Internal(
					"panic recovered",
					fmt.Errorf("%v", err),
				).WithDetails(map[string]interface{}{
					"panic":       fmt.Sprintf("%v", err),
					"stack_trace": stackTrace,
				})

				logging.WithContext(c).Error(
					"panic recovered",
					"panic", err,
					"stack_trace", stackTrace,
					"request_id", logging.GetRequestID(c),
				)

				logging.SetError(c, appErr)

				c.JSON(http.StatusInternalServerError, gin.H{
					"error": gin.H{
						"code":    appErr.Code,
						"message": appErr.Message,
					},
				})

				c.Abort()
			}
		}()

		c.Next()
	}
}
