package search

// TenantListResponse is the paginated listing shape for a tenant's indexed
// documents, returned by GET /internal/documents (see CONTRACT.md §4).
type TenantListResponse struct {
	Documents []TenantDocument `json:"documents"`
	Total     int              `json:"total"`
	Offset    int              `json:"offset"`
	Limit     int              `json:"limit"`
}

// TenantDocumentLister is implemented by engines that can page through a
// tenant's indexed documents. Kept separate from TenantSearchEngine so the
// Catalog can own its files without touching the search tenancy code.
type TenantDocumentLister interface {
	ListTenantDocuments(tenantID string, offset, limit int) (TenantListResponse, error)
}
