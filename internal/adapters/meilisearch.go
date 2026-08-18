package adapters

import (
	"encoding/json"
	"errors"
	"mini-search-platform/internal/models"
	"mini-search-platform/internal/search"
	"net/http"
	"strings"
	"sync"

	"github.com/meilisearch/meilisearch-go"
)

var (
	Client meilisearch.ServiceManager
	Index  meilisearch.IndexManager
)

// tenantSearchableAttrs / tenantFilterableAttrs / tenantSortableAttrs extend
// the base article attribute set with product catalog fields (brand,
// category, price) so seeded e-commerce catalogs are searchable, filterable,
// and sortable. price is filterable + sortable (e.g. price ranges, low→high
// ordering); imageUrl needs no entry here — it is stored and returned in hits
// by default without being searchable/filterable.
var (
	tenantSearchableAttrs = []string{"title", "body", "author", "tags", "brand", "category"}
	tenantFilterableAttrs = []interface{}{"author", "tags", "brand", "category", "price"}
	tenantSortableAttrs   = []string{"author", "title", "price"}
	// tenantRankingRules move "sort" ahead of the relevancy rules (Meilisearch's
	// default is words,typo,proximity,attribute,sort,exactness). With "sort"
	// first, an explicit sort (e.g. price:asc) orders results globally rather
	// than only breaking ties within equal-relevance groups; queries that don't
	// request a sort are unaffected (the sort rule is inert without one).
	tenantRankingRules = []string{"sort", "words", "typo", "proximity", "attribute", "exactness"}
)

type MeilisearchEngine struct {
	Index meilisearch.IndexManager

	// mu guards only the tenantInit map itself, never the network calls
	// that perform the actual initialization — see tenantIndex.
	mu         sync.Mutex
	tenantInit map[string]*sync.Once
}

func Init(host string, apiKey string) *MeilisearchEngine {
	if host == "" {
		host = "http://localhost:7700"
	}

	if apiKey != "" {
		// Production mode with authentication
		Client = meilisearch.New(host, meilisearch.WithAPIKey(apiKey))
	} else {
		// Development mode without authentication
		Client = meilisearch.New(host)
	}
	_, err := Client.CreateIndex(&meilisearch.IndexConfig{
		Uid:        search.ARTICLES_INDEX_NAME,
		PrimaryKey: "id",
	})
	if err != nil {
		panic(err)
	}

	Index = Client.Index(search.ARTICLES_INDEX_NAME)

	searchableAttrs := []string{"title", "body", "author", "tags"}
	_, err = Index.UpdateSearchableAttributes(&searchableAttrs)
	if err != nil {
		panic(err)
	}

	filterableAttrs := []interface{}{"author", "tags"}
	_, err = Index.UpdateFilterableAttributes(&filterableAttrs)
	if err != nil {
		panic(err)
	}

	sortableAttrs := []string{"author", "title"}
	_, err = Index.UpdateSortableAttributes(&sortableAttrs)
	if err != nil {
		panic(err)
	}

	return &MeilisearchEngine{Index: Index}
}

func (e *MeilisearchEngine) IndexArticles(articles []*models.Article) error {
	_, err := e.Index.AddDocuments(articles, nil)
	return err
}

func NewMeilisearchEngine(index meilisearch.IndexManager) *MeilisearchEngine {
	return &MeilisearchEngine{Index: index}
}

func (e *MeilisearchEngine) Search(query string, options search.SearchOptions) (search.SearchResponse, error) {
	result, err := e.Index.Search(query, &meilisearch.SearchRequest{
		Limit:  int64(options.Limit),
		Offset: int64(options.Offset),
		Filter: options.Filter,
		Sort:   options.Sort,
	})
	if err != nil {
		return search.SearchResponse{
			Query: query,
		}, err
	}

	// Convert Hits to json and back to extract articles as SearchHit
	hitsJSON, err := json.Marshal(result.Hits)
	if err != nil {
		return search.SearchResponse{
			Query: query,
		}, err
	}

	var articles []search.SearchHit
	if err := json.Unmarshal(hitsJSON, &articles); err != nil {
		return search.SearchResponse{
			Query: query,
		}, err
	}

	return search.SearchResponse{
		Hits:   articles,
		Offset: int(result.Offset),
		Limit:  int(result.Limit),
		Total:  int(result.EstimatedTotalHits),
		Query:  result.Query,
	}, nil
}

// tenantIndex lazily initializes (searchable/filterable/sortable attributes)
// and returns the Meilisearch index for a given tenant. Index creation and
// settings updates are idempotent (see isIndexAlreadyExists), so it is safe
// to call this on every request; the initialization work itself only runs
// once per tenant per process, via a per-tenant sync.Once, so concurrent
// requests for the *same* tenant don't race, while requests for *different*
// tenants are never serialized behind each other's network calls.
func (e *MeilisearchEngine) tenantIndex(tenantID string) (meilisearch.IndexManager, error) {
	indexName := search.TenantIndexName(tenantID)
	idx := Client.Index(indexName)

	once := e.tenantOnce(indexName)

	var initErr error
	once.Do(func() {
		initErr = initTenantIndex(idx, indexName)
	})
	if initErr != nil {
		// Allow a future call to retry initialization instead of caching
		// the failure forever.
		e.mu.Lock()
		if e.tenantInit[indexName] == once {
			delete(e.tenantInit, indexName)
		}
		e.mu.Unlock()
		return nil, initErr
	}

	return idx, nil
}

// tenantOnce returns the sync.Once guarding initialization of the given
// tenant index, creating it under lock if it doesn't exist yet. The lock is
// only ever held for this map lookup/insert, never across a network call.
func (e *MeilisearchEngine) tenantOnce(indexName string) *sync.Once {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.tenantInit == nil {
		e.tenantInit = make(map[string]*sync.Once)
	}
	once, ok := e.tenantInit[indexName]
	if !ok {
		once = &sync.Once{}
		e.tenantInit[indexName] = once
	}
	return once
}

// initTenantIndex creates (if needed) and configures a tenant's index.
// Meilisearch instances backed by persistent storage will return an
// "index_already_exists" (409) error for CreateIndex after a process
// restart, since the index survives; that error is expected and non-fatal.
func initTenantIndex(idx meilisearch.IndexManager, indexName string) error {
	if _, err := Client.CreateIndex(&meilisearch.IndexConfig{
		Uid:        indexName,
		PrimaryKey: "id",
	}); err != nil && !isIndexAlreadyExists(err) {
		return err
	}

	if _, err := idx.UpdateSearchableAttributes(&tenantSearchableAttrs); err != nil {
		return err
	}
	if _, err := idx.UpdateFilterableAttributes(&tenantFilterableAttrs); err != nil {
		return err
	}
	if _, err := idx.UpdateSortableAttributes(&tenantSortableAttrs); err != nil {
		return err
	}
	if _, err := idx.UpdateRankingRules(&tenantRankingRules); err != nil {
		return err
	}

	return nil
}

// isIndexAlreadyExists reports whether err is Meilisearch's response to
// attempting to create an index that already exists (HTTP 409 /
// "index_already_exists"), which is an expected, idempotent outcome for our
// lazy per-tenant initialization rather than a real failure.
func isIndexAlreadyExists(err error) bool {
	var meiliErr *meilisearch.Error
	if !errors.As(err, &meiliErr) {
		return false
	}
	return meiliErr.StatusCode == http.StatusConflict ||
		meiliErr.MeilisearchApiError.Code == "index_already_exists"
}

// isIndexNotFound reports whether err is Meilisearch's response to searching
// (or otherwise operating on) an index that has never been created (HTTP 404
// / "index_not_found"). A brand-new tenant that has never indexed a document
// has no index yet; per CONTRACT.md this must read as "zero results", not an
// error.
func isIndexNotFound(err error) bool {
	var meiliErr *meilisearch.Error
	if !errors.As(err, &meiliErr) {
		return false
	}
	return meiliErr.StatusCode == http.StatusNotFound ||
		meiliErr.MeilisearchApiError.Code == "index_not_found"
}

// IndexTenantDocuments indexes documents into the tenant's isolated index,
// lazily creating/configuring it on first use.
func (e *MeilisearchEngine) IndexTenantDocuments(tenantID string, documents []search.TenantDocument) error {
	idx, err := e.tenantIndex(tenantID)
	if err != nil {
		return err
	}

	docs := make([]interface{}, len(documents))
	for i, d := range documents {
		docs[i] = d
	}

	_, err = idx.AddDocuments(docs, nil)
	return err
}

// DeleteAllTenantDocuments clears every document from the tenant's isolated
// index without deleting the index itself, so its settings (filterable/sortable
// attributes, facets) are preserved for the rebuild that follows. Meilisearch
// processes an index's tasks in FIFO order, so enqueuing this before the
// subsequent AddDocuments task yields a clean truncate-then-rebuild.
func (e *MeilisearchEngine) DeleteAllTenantDocuments(tenantID string) error {
	idx, err := e.tenantIndex(tenantID)
	if err != nil {
		return err
	}
	_, err = idx.DeleteAllDocuments()
	return err
}

// SearchTenant searches within the tenant's isolated index. Unlike
// IndexTenantDocuments, it deliberately does NOT go through tenantIndex to
// lazily create the index: a search is a read, and a brand-new tenant that
// has never indexed a document simply has no index yet. Per CONTRACT.md,
// that must read back as zero results (not an error, and not a
// side-effecting index creation on a read path).
func (e *MeilisearchEngine) SearchTenant(tenantID string, query string, options search.SearchOptions) (search.TenantSearchResponse, error) {
	indexName := search.TenantIndexName(tenantID)
	idx := Client.Index(indexName)

	req := &meilisearch.SearchRequest{
		Limit:  int64(options.Limit),
		Offset: int64(options.Offset),
		Filter: options.Filter,
		Sort:   options.Sort,
		// Return each hit's relevance score (0..1) as `_rankingScore` so the UI
		// can show it and users can compare relevance ranking against sorts.
		ShowRankingScore: true,
	}
	if options.Facets != "" {
		req.Facets = splitAndTrim(options.Facets)
	}

	result, err := idx.Search(query, req)
	if err != nil {
		if isIndexNotFound(err) {
			return search.TenantSearchResponse{
				Query:  query,
				Hits:   []search.TenantDocument{},
				Total:  0,
				Limit:  options.Limit,
				Offset: options.Offset,
			}, nil
		}
		return search.TenantSearchResponse{Query: query}, err
	}

	hitsJSON, err := json.Marshal(result.Hits)
	if err != nil {
		return search.TenantSearchResponse{Query: query}, err
	}

	var hits []search.TenantDocument
	if err := json.Unmarshal(hitsJSON, &hits); err != nil {
		return search.TenantSearchResponse{Query: query}, err
	}
	if hits == nil {
		hits = []search.TenantDocument{}
	}

	return search.TenantSearchResponse{
		Query:             result.Query,
		Hits:              hits,
		Total:             int(result.EstimatedTotalHits),
		FacetDistribution: convertFacetDistribution(result.FacetDistribution),
		Limit:             int(result.Limit),
		Offset:            int(result.Offset),
	}, nil
}

// splitAndTrim splits a comma-separated list (e.g. the `facets` query param)
// into a trimmed, non-empty slice of fields.
func splitAndTrim(csv string) []string {
	parts := strings.Split(csv, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// convertFacetDistribution decodes Meilisearch's raw facet distribution JSON
// (field -> value -> count) into the strongly-typed
// map[string]map[string]int used in TenantSearchResponse. Returns nil when
// there is nothing to report, so the `omitempty` JSON tag hides the field
// entirely (facets weren't requested).
func convertFacetDistribution(raw json.RawMessage) map[string]map[string]int {
	if len(raw) == 0 {
		return nil
	}

	var out map[string]map[string]int
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
