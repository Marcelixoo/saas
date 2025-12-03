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

func Init(host string) *MeilisearchEngine {
	if host == "" {
		host = "http://localhost:7700"
	}
	Client = meilisearch.New(host)
	_, err := Client.CreateIndex(&meilisearch.IndexConfig{
		Uid:        search.ARTICLES_INDEX_NAME,
		PrimaryKey: "id",
	})
	if err != nil {
		panic(err)
	}

	Index = Client.Index(search.ARTICLES_INDEX_NAME)
	_, err = Index.UpdateSearchableAttributes(&[]string{"title", "body", "author", "tags"})
	if err != nil {
		panic(err)
	}

	_, err = Index.UpdateFilterableAttributes(&[]string{"author", "tags"})
	if err != nil {
		panic(err)
	}

	_, err = Index.UpdateSortableAttributes(&[]string{"author", "title"})
	if err != nil {
		panic(err)
	}

	return &MeilisearchEngine{Index: Index}
}

func (e *MeilisearchEngine) IndexArticles(articles []*models.Article) error {
	_, err := e.Index.AddDocuments(articles)
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

	resultJSON, err := result.MarshalJSON()
	if err != nil {
		return search.SearchResponse{
			Query: query,
		}, err
	}

	var hits = search.SearchHits{}
	if err := json.Unmarshal(resultJSON, &hits); err != nil {
		return search.SearchResponse{
			Query: query,
		}, err
	}

	return search.SearchResponse{
		Hits:   hits.Hits,
		Offset: int(result.Offset),
		Limit:  int(result.Limit),
		Total:  int(result.EstimatedTotalHits),
		Query:  result.Query,
	}, nil
}
