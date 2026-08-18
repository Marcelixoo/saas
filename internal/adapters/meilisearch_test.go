package adapters

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mini-search-platform/internal/search"

	"github.com/google/uuid"
	"github.com/meilisearch/meilisearch-go"
)

// TestSearchTenant_MissingIndex_ReturnsEmptyResultNotError is a regression
// test for the acceptance blocker: a brand-new tenant that has never
// indexed a document has no Meilisearch index yet. Per CONTRACT.md,
// GET /internal/search?q= must return {query, hits: [], total: 0} for such a
// tenant, not a 5xx. This test stubs a Meilisearch server that always
// responds with the real Meilisearch "index_not_found" error and asserts
// SearchTenant tolerates it without creating an index on this read path.
func TestSearchTenant_MissingIndex_ReturnsEmptyResultNotError(t *testing.T) {
	var sawIndexCreateRequest bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// PUT/PATCH/POST /indexes (without a search suffix) would be an
		// attempt to create or configure the index. SearchTenant must not
		// do that on this read path.
		if r.URL.Path == "/indexes" || (r.Method == http.MethodPost && r.URL.Path == "/indexes") {
			sawIndexCreateRequest = true
		}

		// Every search request against this never-created tenant index
		// gets Meilisearch's real "index_not_found" response.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"message": "Index `tenant-does-not-exist` not found.",
			"code":    "index_not_found",
			"type":    "invalid_request",
			"link":    "https://docs.meilisearch.com/errors#index_not_found",
		})
	}))
	defer server.Close()

	// Point the package-level Client (used by SearchTenant) at the stub
	// server, mirroring how tenant operations resolve indexes today.
	Client = meilisearch.New(server.URL)

	engine := &MeilisearchEngine{}

	tenantID := uuid.NewString()
	result, err := engine.SearchTenant(tenantID, "anything", search.SearchOptions{Limit: 10})
	if err != nil {
		t.Fatalf("expected no error for a tenant with no index yet, got: %v", err)
	}

	if result.Total != 0 {
		t.Fatalf("expected total 0 for a tenant with no index yet, got: %d", result.Total)
	}
	if result.Hits == nil || len(result.Hits) != 0 {
		t.Fatalf("expected empty (non-nil) hits slice, got: %v", result.Hits)
	}
	if result.Query != "anything" {
		t.Fatalf("expected query to be echoed back, got: %q", result.Query)
	}
	if sawIndexCreateRequest {
		t.Fatalf("expected SearchTenant not to create an index as a side effect of a search")
	}
}
