package search

import (
	"strings"

	"mini-search-platform/internal/models"
)

var (
	ARTICLES_INDEX_NAME = "articles"
)

type SearchEngine interface {
	Search(q string, options SearchOptions) (SearchResponse, error)
	IndexArticles(articles []*models.Article) error
}

// TenantDocument is a loosely-typed document used by the internal, tenant-aware
// API. Unlike the public Article model, tenants may index arbitrary product
// catalogs (id, title, brand, category, ...), so we keep the shape generic.
type TenantDocument = map[string]interface{}

// TenantSearchResponse mirrors CONTRACT.md §3's search response shape:
// { "query", "hits", "total" } plus, when facets were requested,
// `facetDistribution`, and the effective `limit`/`offset` used for paging.
type TenantSearchResponse struct {
	Query             string                    `json:"query"`
	Hits              []TenantDocument          `json:"hits"`
	Total             int                       `json:"total"`
	FacetDistribution map[string]map[string]int `json:"facetDistribution,omitempty"`
	Limit             int                       `json:"limit"`
	Offset            int                       `json:"offset"`
}

// TenantSearchEngine is implemented by search engines that support
// per-tenant index isolation, as required by the internal Go API
// (CONTRACT.md §4).
type TenantSearchEngine interface {
	SearchTenant(tenantID string, query string, options SearchOptions) (TenantSearchResponse, error)
	IndexTenantDocuments(tenantID string, documents []TenantDocument) error
	// DeleteAllTenantDocuments clears the tenant's index for a clean rebuild,
	// preserving index settings. Enqueued before any following index task.
	DeleteAllTenantDocuments(tenantID string) error
}

// NormalizeTenantID lowercases the org UUID and replaces '-' with '_', per
// CONTRACT.md §4's index naming rule.
func NormalizeTenantID(tenantID string) string {
	return strings.ReplaceAll(strings.ToLower(tenantID), "-", "_")
}

// TenantIndexName returns the Meilisearch index name for a given tenant,
// following the `tenant_<normalized-org-uuid>_articles` convention.
func TenantIndexName(tenantID string) string {
	return "tenant_" + NormalizeTenantID(tenantID) + "_articles"
}

type SearchOptions struct {
	Limit  int      `json:"limit"`
	Offset int      `json:"offset"`
	Sort   []string `json:"sort"`
	Filter string   `json:"filter"`
	Facets string   `json:"facets"`
}

type SearchHit struct {
	ID     int          `json:"id"`
	Title  string       `json:"title"`
	Author string       `json:"author"`
	Body   string       `json:"body"`
	Tags   []models.Tag `json:"tags"`
}

type SearchHits struct {
	Hits []SearchHit `json:"hits"`
}

type SearchResponse struct {
	Query  string      `json:"query"`
	Hits   []SearchHit `json:"hits"`
	Offset int         `json:"offset"`
	Limit  int         `json:"limit"`
	Total  int         `json:"total"`
}

type IndexSyncManager struct {
	Engine             SearchEngine
	ArticlesRepository models.ArticleRepository
	TagsRepository     models.TagsRepository
}

func NewIndexSyncManager(engine SearchEngine, articlesRepository models.ArticleRepository, tagsRepository models.TagsRepository) *IndexSyncManager {
	return &IndexSyncManager{
		Engine:             engine,
		ArticlesRepository: articlesRepository,
		TagsRepository:     tagsRepository,
	}
}

func (m *IndexSyncManager) SyncAfterTagsChanged(tagToSync *models.Tag) error {
	articles, err := m.ArticlesRepository.FindByTag(tagToSync)
	if err != nil {
		return err
	}

	return m.Engine.IndexArticles(articles)
}

func (m *IndexSyncManager) SyncAfterArticlesChanged(articlesToSync []*models.Article) error {
	err := m.Engine.IndexArticles(articlesToSync)
	if err != nil {
		return err
	}

	return nil
}
