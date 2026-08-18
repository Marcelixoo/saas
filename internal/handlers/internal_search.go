package handlers

import (
	"strings"

	"mini-search-platform/internal/search"
	"mini-search-platform/pkg/errors"
	"mini-search-platform/pkg/logging"

	"github.com/gin-gonic/gin"
	"github.com/mcuadros/go-defaults"
)

// TenantIDHeader is the trusted tenant identifier header injected by the
// Fastify control plane (never chosen by external clients; see CONTRACT.md
// §2 and §4).
const TenantIDHeader = "X-Tenant-ID"

// requireTenantID extracts and validates the X-Tenant-ID header, writing a
// 400 response and returning ok=false when it is missing or empty.
func requireTenantID(c *gin.Context) (tenantID string, ok bool) {
	tenantID = strings.TrimSpace(c.GetHeader(TenantIDHeader))
	if tenantID == "" {
		errors.Handle(c, errors.Validation("X-Tenant-ID header is required"))
		return "", false
	}
	// Attach the validated tenant ID to the request context so the
	// per-request log line (pkg/logging.RequestLogger) is labeled with it —
	// this is the data source for the per-tenant latency/error-rate SLIs
	// described in docs/observability.md.
	logging.SetTenantID(c, tenantID)
	return tenantID, true
}

// InternalSearch handles GET /internal/search?q=... — the internal,
// tenant-scoped counterpart of the public /search endpoint. Only the
// Fastify control plane is expected to call this route (CONTRACT.md §4).
func InternalSearch(engine search.TenantSearchEngine) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID, ok := requireTenantID(c)
		if !ok {
			return
		}

		var params SearchQueryParams
		defaults.SetDefaults(&params)

		if err := c.ShouldBindQuery(&params); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		result, err := engine.SearchTenant(tenantID, params.Query, search.SearchOptions{
			Limit:  params.Limit,
			Offset: params.Offset,
			Filter: params.Filter,
			Sort:   []string{params.Sort},
			Facets: params.Facets,
		})
		if err != nil {
			errors.Handle(c, errors.Search("failed to search tenant documents", err))
			return
		}

		c.JSON(200, result)
	}
}

// InternalDocumentsBatchInput matches CONTRACT.md §3's
// `POST /organizations/:slug/documents/batch` body, which is proxied
// unchanged into the internal API.
type InternalDocumentsBatchInput struct {
	Documents []search.TenantDocument `json:"documents" binding:"required"`
}

// InternalIndexDocumentsBatch handles POST /internal/documents/batch,
// indexing documents into the caller-supplied tenant's isolated index.
func InternalIndexDocumentsBatch(engine search.TenantSearchEngine) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID, ok := requireTenantID(c)
		if !ok {
			return
		}

		var input InternalDocumentsBatchInput
		if err := c.ShouldBindJSON(&input); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		// reset=true truncates the tenant index before indexing, so a re-seed
		// rebuilds the catalog from scratch instead of layering onto stale docs.
		if c.Query("reset") == "true" {
			if err := engine.DeleteAllTenantDocuments(tenantID); err != nil {
				errors.Handle(c, errors.Search("failed to reset tenant documents", err))
				return
			}
		}

		if err := engine.IndexTenantDocuments(tenantID, input.Documents); err != nil {
			errors.Handle(c, errors.Search("failed to index tenant documents", err))
			return
		}

		c.JSON(202, gin.H{"accepted": len(input.Documents)})
	}
}
