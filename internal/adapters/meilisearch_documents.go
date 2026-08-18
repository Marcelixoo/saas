package adapters

import (
	"encoding/json"
	"mini-search-platform/internal/search"

	"github.com/meilisearch/meilisearch-go"
)

// ListTenantDocuments pages through a tenant's indexed documents.
//
// Like SearchTenant, this is a read path: it deliberately does NOT go through
// tenantIndex to lazily create the index. A brand-new tenant that has never
// indexed a document simply has no index yet, which must read back as an
// empty page (not an error).
func (e *MeilisearchEngine) ListTenantDocuments(
	tenantID string,
	offset, limit int,
) (search.TenantListResponse, error) {
	indexName := search.TenantIndexName(tenantID)
	idx := Client.Index(indexName)

	var result meilisearch.DocumentsResult
	err := idx.GetDocuments(&meilisearch.DocumentsQuery{
		Offset: int64(offset),
		Limit:  int64(limit),
	}, &result)
	if err != nil {
		if isIndexNotFound(err) {
			return search.TenantListResponse{
				Documents: []search.TenantDocument{},
				Total:     0,
				Offset:    offset,
				Limit:     limit,
			}, nil
		}
		return search.TenantListResponse{Offset: offset, Limit: limit}, err
	}

	docsJSON, err := json.Marshal(result.Results)
	if err != nil {
		return search.TenantListResponse{Offset: offset, Limit: limit}, err
	}

	var documents []search.TenantDocument
	if err := json.Unmarshal(docsJSON, &documents); err != nil {
		return search.TenantListResponse{Offset: offset, Limit: limit}, err
	}
	if documents == nil {
		documents = []search.TenantDocument{}
	}

	return search.TenantListResponse{
		Documents: documents,
		Total:     int(result.Total),
		Offset:    offset,
		Limit:     limit,
	}, nil
}
