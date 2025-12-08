package adapters

import (
	"encoding/json"
	"mini-search-platform/internal/models"
	"mini-search-platform/internal/search"

	"github.com/meilisearch/meilisearch-go"
)

var (
	Client meilisearch.ServiceManager
	Index  meilisearch.IndexManager
)

type MeilisearchEngine struct {
	Index meilisearch.IndexManager
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
