package handlers

import (
	"mini-search-platform/internal/search"
	"mini-search-platform/pkg/errors"

	"github.com/gin-gonic/gin"
	"github.com/mcuadros/go-defaults"
)

// ListDocumentsParams matches CONTRACT.md §4's
// GET /internal/documents?offset=0&limit=20 query.
type ListDocumentsParams struct {
	Limit  int `form:"limit" default:"20"`
	Offset int `form:"offset" default:"0"`
}

// InternalListDocuments handles GET /internal/documents — the internal,
// tenant-scoped document listing used by the Catalog explorer. Only the
// Fastify control plane is expected to call this route (CONTRACT.md §4).
func InternalListDocuments(lister search.TenantDocumentLister) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID, ok := requireTenantID(c)
		if !ok {
			return
		}

		var params ListDocumentsParams
		defaults.SetDefaults(&params)

		if err := c.ShouldBindQuery(&params); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		result, err := lister.ListTenantDocuments(tenantID, params.Offset, params.Limit)
		if err != nil {
			errors.Handle(c, errors.Search("failed to list tenant documents", err))
			return
		}

		c.JSON(200, result)
	}
}
