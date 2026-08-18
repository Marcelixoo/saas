package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"mini-search-platform/internal/adapters"
	"mini-search-platform/internal/handlers"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// meilisearchAvailable skips tenant-isolation tests when a Meilisearch
// instance is not reachable (e.g. no service container in this CI run).
// Locally, run: docker run --rm -d -p 7700:7700 -e MEILI_NO_ANALYTICS=true getmeili/meilisearch:v1.13
func meilisearchAvailable(t *testing.T, host string) bool {
	t.Helper()

	addr := host
	addr = addr[len("http://"):]
	conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func newTestRouter(t *testing.T) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	host := os.Getenv("MEILISEARCH_HOST")
	if host == "" {
		host = "http://localhost:7700"
	}
	if !meilisearchAvailable(t, host) {
		t.Skip("meilisearch not reachable at " + host + "; skipping tenant isolation test")
	}

	engine := adapters.Init(host, os.Getenv("MEILISEARCH_API_KEY"))

	r := gin.New()
	r.GET("/internal/search", handlers.InternalSearch(engine))
	r.POST("/internal/documents/batch", handlers.InternalIndexDocumentsBatch(engine))

	return r, host
}

func indexDocument(t *testing.T, r *gin.Engine, tenantID string, doc map[string]interface{}) {
	t.Helper()

	body, err := json.Marshal(map[string]interface{}{
		"documents": []map[string]interface{}{doc},
	})
	if err != nil {
		t.Fatalf("failed to marshal batch payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/internal/documents/batch", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(handlers.TenantIDHeader, tenantID)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 accepted, got %d: %s", w.Code, w.Body.String())
	}
}

func searchAsTenant(t *testing.T, r *gin.Engine, tenantID, query string) map[string]interface{} {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/internal/search?q="+url.QueryEscape(query), nil)
	if tenantID != "" {
		req.Header.Set(handlers.TenantIDHeader, tenantID)
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var result map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("failed to unmarshal search response: %v", err)
	}
	return result
}

// trySearchAsTenant is like searchAsTenant but tolerates transient errors
// (e.g. the tenant index's settings tasks, such as sortable attributes,
// have not finished applying yet in Meilisearch) instead of failing the
// test outright. Used only while polling for eventual consistency.
func trySearchAsTenant(t *testing.T, r *gin.Engine, tenantID, query string) (map[string]interface{}, bool) {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/internal/search?q="+url.QueryEscape(query), nil)
	req.Header.Set(handlers.TenantIDHeader, tenantID)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		return nil, false
	}

	var result map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		return nil, false
	}
	return result, true
}

// TestTenantIsolation_SearchOnlyReturnsOwnTenantDocuments is the MANDATORY
// isolation test: Tenant A indexes a unique document, searching as Tenant A
// finds it, and searching the same query as Tenant B returns zero hits.
func TestTenantIsolation_SearchOnlyReturnsOwnTenantDocuments(t *testing.T) {
	r, _ := newTestRouter(t)

	tenantA := uuid.NewString()
	tenantB := uuid.NewString()

	uniqueTitle := fmt.Sprintf("Unobtainium Widget %s", uuid.NewString())
	indexDocument(t, r, tenantA, map[string]interface{}{
		"id":    "sku-" + uuid.NewString(),
		"title": uniqueTitle,
		"brand": "Acme",
	})

	// Meilisearch indexing and settings updates are asynchronous; poll
	// briefly for the document to become searchable before asserting.
	var resultA map[string]interface{}
	found := false
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		result, ok := trySearchAsTenant(t, r, tenantA, uniqueTitle)
		if ok {
			resultA = result
			if hits, ok := resultA["hits"].([]interface{}); ok && len(hits) > 0 {
				found = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !found {
		t.Fatalf("timed out waiting for tenant A's document to become searchable, last result: %v", resultA)
	}

	hitsA, ok := resultA["hits"].([]interface{})
	if !ok || len(hitsA) != 1 {
		t.Fatalf("expected tenant A to find exactly 1 hit, got: %v", resultA)
	}

	var resultB map[string]interface{}
	deadline = time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		result, ok := trySearchAsTenant(t, r, tenantB, uniqueTitle)
		if ok {
			resultB = result
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if resultB == nil {
		t.Fatalf("timed out waiting for tenant B's index to become searchable")
	}
	hitsB, ok := resultB["hits"].([]interface{})
	if !ok {
		t.Fatalf("expected tenant B response to include a hits array, got: %v", resultB)
	}
	if len(hitsB) != 0 {
		t.Fatalf("expected tenant B to find 0 hits (isolation breach), got: %v", resultB)
	}
}

// TestInternalSearch_MissingTenantHeader_Returns400 asserts the trust
// boundary from CONTRACT.md §4: a missing/empty X-Tenant-ID header must be
// rejected with 400, both for search and for the batch indexing endpoint.
func TestInternalSearch_MissingTenantHeader_Returns400(t *testing.T) {
	r, _ := newTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/internal/search?q=anything", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing X-Tenant-ID on search, got %d: %s", w.Code, w.Body.String())
	}
}

func TestInternalDocumentsBatch_MissingTenantHeader_Returns400(t *testing.T) {
	r, _ := newTestRouter(t)

	body := bytes.NewBufferString(`{"documents":[{"id":"x","title":"y"}]}`)
	req := httptest.NewRequest(http.MethodPost, "/internal/documents/batch", body)
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing X-Tenant-ID on batch, got %d: %s", w.Code, w.Body.String())
	}
}

// TestInternalDocumentsBatch_EmptyTenantHeader_Returns400 asserts that an
// empty (whitespace) header value is treated the same as missing.
func TestInternalDocumentsBatch_EmptyTenantHeader_Returns400(t *testing.T) {
	r, _ := newTestRouter(t)

	body := bytes.NewBufferString(`{"documents":[{"id":"x","title":"y"}]}`)
	req := httptest.NewRequest(http.MethodPost, "/internal/documents/batch", body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(handlers.TenantIDHeader, "   ")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for blank X-Tenant-ID, got %d: %s", w.Code, w.Body.String())
	}
}
