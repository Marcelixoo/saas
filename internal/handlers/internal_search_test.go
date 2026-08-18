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
	"strings"
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

	addr := hostPort(host)

	conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// hostPort extracts a dialable "host:port" from a Meilisearch host value,
// which may be a full URL ("http://localhost:7700", "https://host:7700")
// or already a bare "host:port". Falls back to the default Meilisearch port
// when none is present.
func hostPort(host string) string {
	addr := host

	if u, err := url.Parse(host); err == nil && u.Host != "" {
		addr = u.Host
	}

	if _, _, err := net.SplitHostPort(addr); err != nil {
		addr = net.JoinHostPort(strings.TrimSuffix(addr, ":"), "7700")
	}

	return addr
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

// indexDocumentReset posts a batch with `?reset=true`, which truncates the
// tenant index before indexing the given document.
func indexDocumentReset(t *testing.T, r *gin.Engine, tenantID string, doc map[string]interface{}) {
	t.Helper()

	body, err := json.Marshal(map[string]interface{}{
		"documents": []map[string]interface{}{doc},
	})
	if err != nil {
		t.Fatalf("failed to marshal batch payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/internal/documents/batch?reset=true", bytes.NewReader(body))
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

// searchAsTenantWithQuery is like searchAsTenant but forwards an arbitrary
// raw query string (e.g. "q=shoe&filter=...&sort=...&facets=...") instead of
// just `q`, so tests can exercise filter/sort/facets end-to-end.
func searchAsTenantWithQuery(t *testing.T, r *gin.Engine, tenantID, rawQuery string) map[string]interface{} {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/internal/search?"+rawQuery, nil)
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

// trySearchAsTenantWithQuery mirrors trySearchAsTenant but forwards an
// arbitrary raw query string, for polling filter/sort/facets results while
// tenant index settings converge.
func trySearchAsTenantWithQuery(t *testing.T, r *gin.Engine, tenantID, rawQuery string) (map[string]interface{}, bool) {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/internal/search?"+rawQuery, nil)
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

// TestInternalSearch_FilterSortFacetsAndPaging_EndToEnd indexes a small
// per-tenant catalog with brand/category/price and asserts that `filter`,
// `sort`, `facets`, `limit`, and `offset` all reach Meilisearch and shape the
// response as CONTRACT.md §3/§4 describe: `facetDistribution` present only
// when `facets` was requested, and `limit`/`offset` echoing the effective
// paging.
func TestInternalSearch_FilterSortFacetsAndPaging_EndToEnd(t *testing.T) {
	r, _ := newTestRouter(t)

	tenant := uuid.NewString()
	uniqueBrand := "Bramd" + strings.ReplaceAll(uuid.NewString(), "-", "")

	indexDocument(t, r, tenant, map[string]interface{}{
		"id": "sku-a-" + uuid.NewString(), "title": "Alpha Shoe",
		"brand": uniqueBrand, "category": "shoes", "price": 30.0,
	})
	indexDocument(t, r, tenant, map[string]interface{}{
		"id": "sku-b-" + uuid.NewString(), "title": "Beta Shoe",
		"brand": uniqueBrand, "category": "shoes", "price": 10.0,
	})
	indexDocument(t, r, tenant, map[string]interface{}{
		"id": "sku-c-" + uuid.NewString(), "title": "Gamma Shirt",
		"brand": uniqueBrand, "category": "shirts", "price": 20.0,
	})

	filterQ := fmt.Sprintf(
		"q=%s&filter=%s&sort=%s&facets=%s&limit=10&offset=0",
		url.QueryEscape(uniqueBrand),
		url.QueryEscape(`category = "shoes"`),
		url.QueryEscape("price:asc"),
		url.QueryEscape("category"),
	)

	var result map[string]interface{}
	found := false
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		res, ok := trySearchAsTenantWithQuery(t, r, tenant, filterQ)
		if ok {
			result = res
			if hits, ok := res["hits"].([]interface{}); ok && len(hits) == 2 {
				found = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !found {
		t.Fatalf("timed out waiting for filtered/sorted/faceted results, last result: %v", result)
	}

	hits, ok := result["hits"].([]interface{})
	if !ok || len(hits) != 2 {
		t.Fatalf("expected filter to restrict to the 2 'shoes' docs, got: %v", result)
	}

	first, ok := hits[0].(map[string]interface{})
	if !ok || first["title"] != "Beta Shoe" {
		t.Fatalf("expected price:asc to sort the cheaper shoe first, got: %v", hits)
	}

	facetDist, ok := result["facetDistribution"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected facetDistribution to be present when facets were requested, got: %v", result)
	}
	categoryFacet, ok := facetDist["category"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a 'category' facet distribution, got: %v", facetDist)
	}
	if count, ok := categoryFacet["shoes"].(float64); !ok || count != 2 {
		t.Fatalf("expected facetDistribution.category.shoes == 2, got: %v", categoryFacet["shoes"])
	}

	if limit, ok := result["limit"].(float64); !ok || int(limit) != 10 {
		t.Fatalf("expected limit to echo the requested 10, got: %v", result["limit"])
	}
	if offset, ok := result["offset"].(float64); !ok || int(offset) != 0 {
		t.Fatalf("expected offset to echo the requested 0, got: %v", result["offset"])
	}

	// Without `facets`, the field must be entirely absent (backward compat).
	plainQ := fmt.Sprintf("q=%s", url.QueryEscape(uniqueBrand))
	plainResult := searchAsTenantWithQuery(t, r, tenant, plainQ)
	if _, present := plainResult["facetDistribution"]; present {
		t.Fatalf("expected facetDistribution to be absent when facets weren't requested, got: %v", plainResult)
	}
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

// TestInternalDocumentsBatch_BodyAndTagsRoundTrip asserts the full document
// shape (body, author, tags) survives the batch-index -> search round trip,
// not just id/title/brand/category. It indexes a document whose only
// distinguishing content lives in `body` and `tags`, then confirms it is
// findable by a term that appears ONLY there.
func TestInternalDocumentsBatch_BodyAndTagsRoundTrip(t *testing.T) {
	r, _ := newTestRouter(t)

	tenant := uuid.NewString()
	uniqueBodyTerm := fmt.Sprintf("Xylophonic%s", strings.ReplaceAll(uuid.NewString(), "-", ""))
	uniqueTag := fmt.Sprintf("tag-%s", uuid.NewString())

	indexDocument(t, r, tenant, map[string]interface{}{
		"id":     "sku-" + uuid.NewString(),
		"title":  "Ordinary Product",
		"body":   fmt.Sprintf("This product features a %s coating.", uniqueBodyTerm),
		"author": "Catalog Team",
		"tags":   []string{uniqueTag, "misc"},
		"brand":  "Acme",
	})

	var result map[string]interface{}
	found := false
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		res, ok := trySearchAsTenant(t, r, tenant, uniqueBodyTerm)
		if ok {
			result = res
			if hits, ok := result["hits"].([]interface{}); ok && len(hits) > 0 {
				found = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !found {
		t.Fatalf("timed out waiting for body-only term %q to become searchable, last result: %v", uniqueBodyTerm, result)
	}

	hits, ok := result["hits"].([]interface{})
	if !ok || len(hits) != 1 {
		t.Fatalf("expected exactly 1 hit for body-only term, got: %v", result)
	}

	hit, ok := hits[0].(map[string]interface{})
	if !ok {
		t.Fatalf("expected hit to be an object, got: %v", hits[0])
	}
	if hit["author"] != "Catalog Team" {
		t.Fatalf("expected author to round-trip, got: %v", hit["author"])
	}
	tags, ok := hit["tags"].([]interface{})
	if !ok || len(tags) != 2 {
		t.Fatalf("expected tags to round-trip as a 2-element array, got: %v", hit["tags"])
	}

	// Also confirm the tag itself is independently searchable.
	var byTag map[string]interface{}
	foundByTag := false
	deadline = time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		res, ok := trySearchAsTenant(t, r, tenant, uniqueTag)
		if ok {
			byTag = res
			if hits, ok := byTag["hits"].([]interface{}); ok && len(hits) > 0 {
				foundByTag = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !foundByTag {
		t.Fatalf("timed out waiting for tag %q to become searchable, last result: %v", uniqueTag, byTag)
	}
}

// TestInternalDocumentsBatch_ResetTruncatesIndex asserts that a batch sent with
// `?reset=true` truncates the tenant index first: after re-seeding with reset,
// documents from the previous seed are gone and only the new documents remain.
func TestInternalDocumentsBatch_ResetTruncatesIndex(t *testing.T) {
	r, _ := newTestRouter(t)

	tenant := uuid.NewString()
	oldTerm := fmt.Sprintf("Oldonium%s", strings.ReplaceAll(uuid.NewString(), "-", ""))
	newTerm := fmt.Sprintf("Newtronic%s", strings.ReplaceAll(uuid.NewString(), "-", ""))

	// First seed.
	indexDocument(t, r, tenant, map[string]interface{}{
		"id": "sku-old-" + uuid.NewString(), "title": oldTerm + " Gadget",
	})

	// Wait for the first doc to become searchable.
	found := false
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		res, ok := trySearchAsTenant(t, r, tenant, oldTerm)
		if ok {
			if hits, ok := res["hits"].([]interface{}); ok && len(hits) == 1 {
				found = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !found {
		t.Fatalf("timed out waiting for the first-seed document to become searchable")
	}

	// Re-seed with reset=true and a different document.
	indexDocumentReset(t, r, tenant, map[string]interface{}{
		"id": "sku-new-" + uuid.NewString(), "title": newTerm + " Gadget",
	})

	// The new doc must appear and the old one must disappear.
	newFound := false
	deadline = time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		newRes, ok := trySearchAsTenant(t, r, tenant, newTerm)
		if !ok {
			time.Sleep(200 * time.Millisecond)
			continue
		}
		newHits, _ := newRes["hits"].([]interface{})
		oldRes, _ := trySearchAsTenant(t, r, tenant, oldTerm)
		oldHits, _ := oldRes["hits"].([]interface{})
		if len(newHits) == 1 && len(oldHits) == 0 {
			newFound = true
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !newFound {
		t.Fatalf("expected reset to leave only the new document (old term gone, new term present)")
	}
}

// TestInternalSearch_SortDominatesRelevance asserts the ranking-rule change:
// an explicit sort orders results globally, not merely as a tie-breaker within
// equal-relevance groups. A title with more term repetitions would rank first
// under default relevancy, but price:asc must surface the cheapest hit first.
func TestInternalSearch_SortDominatesRelevance(t *testing.T) {
	r, _ := newTestRouter(t)

	tenant := uuid.NewString()
	term := fmt.Sprintf("Widgetron%s", strings.ReplaceAll(uuid.NewString(), "-", ""))

	// More-relevant (term repeated) but expensive.
	indexDocument(t, r, tenant, map[string]interface{}{
		"id": "sku-hi-" + uuid.NewString(), "title": term + " " + term + " " + term, "price": 99.0,
	})
	// Less-relevant (term once) but cheap.
	indexDocument(t, r, tenant, map[string]interface{}{
		"id": "sku-lo-" + uuid.NewString(), "title": term, "price": 1.0,
	})

	sortQ := fmt.Sprintf("q=%s&sort=%s&limit=10", url.QueryEscape(term), url.QueryEscape("price:asc"))

	var hits []interface{}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		res, ok := trySearchAsTenantWithQuery(t, r, tenant, sortQ)
		if ok {
			if h, ok := res["hits"].([]interface{}); ok && len(h) == 2 {
				hits = h
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if len(hits) != 2 {
		t.Fatalf("timed out waiting for both documents to become searchable")
	}

	first, ok := hits[0].(map[string]interface{})
	if !ok {
		t.Fatalf("expected first hit to be an object, got: %v", hits[0])
	}
	if price, ok := first["price"].(float64); !ok || price != 1.0 {
		t.Fatalf("expected price:asc to dominate relevancy and put the $1 hit first, got price: %v", first["price"])
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
