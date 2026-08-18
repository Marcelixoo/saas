package adapters

import "mini-search-platform/internal/search"

// ListTenantDocuments pages through a tenant's indexed documents.
//
// Scaffold owned by Agent C (Catalog): replace the empty result with a real
// call into the tenant index (Meilisearch `GetDocuments` with offset/limit,
// reading Total from the documents result). Kept in its own file so the search
// tenancy code (meilisearch.go, Agent B) stays single-owner.
func (e *MeilisearchEngine) ListTenantDocuments(
	tenantID string,
	offset, limit int,
) (search.TenantListResponse, error) {
	return search.TenantListResponse{
		Documents: []search.TenantDocument{},
		Total:     0,
		Offset:    offset,
		Limit:     limit,
	}, nil
}
