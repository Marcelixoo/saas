package adapters

import (
	"encoding/json"
	"mini-search-platform/internal/models"
	"mini-search-platform/internal/search"
	"sync"

	"github.com/meilisearch/meilisearch-go"
)

var (
	Client meilisearch.ServiceManager
	Index  meilisearch.IndexManager
)

// tenantSearchableAttrs / tenantFilterableAttrs / tenantSortableAttrs extend
// the base article attribute set with product catalog fields (brand,
// category) so seeded e-commerce catalogs are searchable/filterable too.
var (
	tenantSearchableAttrs = []string{"title", "body", "author", "tags", "brand", "category"}
	tenantFilterableAttrs = []interface{}{"author", "tags", "brand", "category"}
	tenantSortableAttrs   = []string{"author", "title"}
)

type MeilisearchEngine struct {
	Index meilisearch.IndexManager

	mu                 sync.Mutex
	initializedTenants map[string]bool
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
// settings updates are idempotent, so it is safe to call this on every
// request; the initialization work itself only runs once per tenant per
// process (tracked via initializedTenants) to avoid unnecessary calls.
func (e *MeilisearchEngine) tenantIndex(tenantID string) (meilisearch.IndexManager, error) {
	indexName := search.TenantIndexName(tenantID)
	idx := Client.Index(indexName)

	e.mu.Lock()
	defer e.mu.Unlock()

	if e.initializedTenants == nil {
		e.initializedTenants = make(map[string]bool)
	}
	if e.initializedTenants[indexName] {
		return idx, nil
	}

	if _, err := Client.CreateIndex(&meilisearch.IndexConfig{
		Uid:        indexName,
		PrimaryKey: "id",
	}); err != nil {
		return nil, err
	}

	if _, err := idx.UpdateSearchableAttributes(&tenantSearchableAttrs); err != nil {
		return nil, err
	}
	if _, err := idx.UpdateFilterableAttributes(&tenantFilterableAttrs); err != nil {
		return nil, err
	}
	if _, err := idx.UpdateSortableAttributes(&tenantSortableAttrs); err != nil {
		return nil, err
	}

	e.initializedTenants[indexName] = true
	return idx, nil
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

// SearchTenant searches within the tenant's isolated index, lazily
// creating/configuring it on first use.
func (e *MeilisearchEngine) SearchTenant(tenantID string, query string, options search.SearchOptions) (search.TenantSearchResponse, error) {
	idx, err := e.tenantIndex(tenantID)
	if err != nil {
		return search.TenantSearchResponse{Query: query}, err
	}

	result, err := idx.Search(query, &meilisearch.SearchRequest{
		Limit:  int64(options.Limit),
		Offset: int64(options.Offset),
		Filter: options.Filter,
		Sort:   options.Sort,
	})
	if err != nil {
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
		Query: result.Query,
		Hits:  hits,
		Total: int(result.EstimatedTotalHits),
	}, nil
}
