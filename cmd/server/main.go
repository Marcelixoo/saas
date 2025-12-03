package main

import (
	"log"
	"mini-search-platform/config"
	"mini-search-platform/internal/adapters"
	"mini-search-platform/internal/database"
	"mini-search-platform/internal/handlers"
	"mini-search-platform/internal/middleware"
	"mini-search-platform/internal/search"
	"mini-search-platform/pkg/security"
	"mini-search-platform/pkg/sqlite"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration from environment
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize database
	db, err := sqlite.Init(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer sqlite.Close(db)

	err = database.Create(db)
	if err != nil {
		log.Fatalf("Failed to create database schema: %v", err)
	}

	// Initialize repositories
	articles := adapters.NewSQLliteArticleRepository(db)
	authors := adapters.NewSQLliteAuthorsRepository(db)
	tags := adapters.NewSQLliteTagsRepository(db)
	users := adapters.NewSQLiteUserRepository(db)
	tenants := adapters.NewSQLiteTenantRepository(db)
	memberships := adapters.NewSQLiteMembershipRepository(db)

	// Initialize JWT service with config
	jwtSvc := security.NewJWTService(cfg.JWT.SecretKey, cfg.JWT.Issuer, cfg.JWT.AccessTTL)

	// Initialize search engine
	engine := adapters.Init(cfg.Meilisearch.Host)

	sync := search.NewIndexSyncManager(engine, articles, tags)

	// Initialize rate limiter with config
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimit.SearchLimit)
	rateLimiter.Cleanup(5 * time.Minute)

	authMiddleware := middleware.NewAuthMiddleware(jwtSvc, users)

	r := gin.Default()

	handlers.SetupSwagger(r)

	ttlaccess := int64(cfg.JWT.AccessTTL.Seconds())

	// resource: auth (public endpoints)
	r.POST("/auth/register", handlers.Register(users, tenants, memberships, jwtSvc, ttlaccess))
	r.POST("/auth/login", handlers.Login(users, jwtSvc, ttlaccess))
	r.POST("/auth/refresh", handlers.RefreshToken(jwtSvc, ttlaccess))

	// resource: logged user (protected)
	r.GET("/api/me", authMiddleware.RequireAuth(), handlers.GetCurrentUser(users))

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

	log.Printf("Starting server on port %s", cfg.Server.Port)
	r.Run(":" + cfg.Server.Port)
}
