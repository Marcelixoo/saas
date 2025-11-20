package main

import (
	"mini-search-platform/internal/adapters"
	"mini-search-platform/internal/database"
	"mini-search-platform/internal/handlers"
	"mini-search-platform/internal/middleware"
	"mini-search-platform/pkg/sqlite"
	"os"
	"strconv"
	"time"

	"mini-search-platform/internal/search"

	"github.com/gin-gonic/gin"
)

func main() {
	db, err := sqlite.Init()
	if err != nil {
		panic(err)
	}
	defer sqlite.Close(db)

	err = database.Create(db)
	if err != nil {
		panic(err)
	}

	articles := adapters.NewSQLliteArticleRepository(db)
	authors := adapters.NewSQLliteAuthorsRepository(db)
	tags := adapters.NewSQLliteTagsRepository(db)

	engine := adapters.Init()

	sync := search.NewIndexSyncManager(engine, articles, tags)

	searchRateLimit := 60
	if limit := os.Getenv("SEARCH_RATE_LIMIT"); limit != "" {
		if val, err := strconv.Atoi(limit); err == nil && val > 0 {
			searchRateLimit = val
		}
	}
	rateLimiter := middleware.NewRateLimiter(searchRateLimit)
	rateLimiter.Cleanup(5 * time.Minute)

	r := gin.Default()
	// resource: articles
	r.POST("/articles", handlers.AddArticle(articles, authors, tags, sync))
	r.POST("/articles/batch", handlers.AddArticles(articles, authors, tags, sync))

	// resource: authors
	r.POST("/authors", handlers.AddAuthor(authors))
	r.POST("/authors/batch", handlers.AddAuthors(authors))

	// resource: tags
	r.POST("/tags", handlers.AddTag(tags))
	r.PATCH("/tags/:label", handlers.UpdateTagWithLabel(tags, sync))
	r.POST("/tags/batch", handlers.AddTagsInBatch(tags))
	r.GET("/tags", handlers.ListAllTags(tags))
	r.GET("/tags/:label", handlers.GetTagByLabel(tags))
	r.GET("/tags/:label/articles", handlers.FindArticlesByLabels(articles, tags))

	// resource: search (with rate limiting)
	r.GET("/search", rateLimiter.Middleware(), handlers.SearchArticles(engine))

	r.Run(":8080")
}
