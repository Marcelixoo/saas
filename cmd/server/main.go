package main

import (
	"database/sql"
	"log"
	"mini-search-platform/config"
	"mini-search-platform/internal/adapters"
	"mini-search-platform/internal/database"
	"mini-search-platform/internal/handlers"
	"mini-search-platform/internal/middleware"
	"mini-search-platform/internal/models"
	"mini-search-platform/internal/search"
	"mini-search-platform/pkg/postgres"
	"mini-search-platform/pkg/security"
	"mini-search-platform/pkg/sqlite"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	isPostgres := strings.HasPrefix(cfg.Database.Path, "postgres://") || strings.HasPrefix(cfg.Database.Path, "postgresql://")

	var db *sql.DB
	var articles models.ArticleRepository
	var tags models.TagsRepository
	var users models.UserRepository
	var tenants models.TenantRepository
	var memberships models.MembershipRepository

	if isPostgres {
		db, err = postgres.Init(cfg.Database.Path)
		if err != nil {
			log.Fatalf("Failed to initialize PostgreSQL database: %v", err)
		}
		defer postgres.Close(db)

		err = database.CreatePostgres(db)
		if err != nil {
			log.Fatalf("Failed to create PostgreSQL schema: %v", err)
		}

		articles = adapters.NewPostgresArticleRepository(db)
		authors := adapters.NewPostgresAuthorsRepository(db)
		tags = adapters.NewPostgresTagsRepository(db)
		users = adapters.NewPostgresUserRepository(db)
		tenants = adapters.NewPostgresTenantRepository(db)
		memberships = adapters.NewPostgresMembershipRepository(db)

		log.Println("Using PostgreSQL database")

		jwtSvc := security.NewJWTService(cfg.JWT.SecretKey, cfg.JWT.Issuer, cfg.JWT.AccessTTL)

		meilisearchAPIKey := os.Getenv("MEILISEARCH_API_KEY")
		meilisearchHost := os.Getenv("MEILISEARCH_HOST")
		if meilisearchHost == "" {
			meilisearchHost = "http://localhost:7700"
		}
		engine := adapters.Init(meilisearchHost, meilisearchAPIKey)

		sync := search.NewIndexSyncManager(engine, articles, tags)

		rateLimiter := middleware.NewRateLimiter(cfg.RateLimit.SearchLimit)
		rateLimiter.Cleanup(5 * time.Minute)

		authMiddleware := middleware.NewAuthMiddleware(jwtSvc, users)

		r := gin.Default()

		r.Use(cors.New(cors.Config{
			AllowOrigins:     []string{"*"},
			AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
			ExposeHeaders:    []string{"Content-Length"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}))

		handlers.SetupSwagger(r)

		ttlaccess := int64(cfg.JWT.AccessTTL.Seconds())

		r.POST("/auth/register", handlers.Register(users, tenants, memberships, jwtSvc, ttlaccess))
		r.POST("/auth/login", handlers.Login(users, jwtSvc, ttlaccess))
		r.POST("/auth/refresh", handlers.RefreshToken(jwtSvc, ttlaccess))

		r.GET("/api/me", authMiddleware.RequireAuth(), handlers.GetCurrentUser(users))

		r.POST("/articles", handlers.AddArticle(articles, authors, tags, sync))
		r.POST("/articles/batch", handlers.AddArticles(articles, authors, tags, sync))

		r.POST("/authors", handlers.AddAuthor(authors))
		r.POST("/authors/batch", handlers.AddAuthors(authors))

		r.POST("/tags", handlers.AddTag(tags))
		r.PATCH("/tags/:label", handlers.UpdateTagWithLabel(tags, sync))
		r.POST("/tags/batch", handlers.AddTagsInBatch(tags))
		r.GET("/tags", handlers.ListAllTags(tags))
		r.GET("/tags/:label", handlers.GetTagByLabel(tags))
		r.GET("/tags/:label/articles", handlers.FindArticlesByLabels(articles, tags))

		r.GET("/search", rateLimiter.Middleware(), handlers.SearchArticles(engine))

		log.Printf("Starting server on port %s", cfg.Server.Port)
		r.Run(":" + cfg.Server.Port)
	} else {
		db, err = sqlite.Init(cfg.Database.Path)
		if err != nil {
			log.Fatalf("Failed to initialize SQLite database: %v", err)
		}
		defer sqlite.Close(db)

		err = database.Create(db)
		if err != nil {
			log.Fatalf("Failed to create SQLite schema: %v", err)
		}

		articles = adapters.NewSQLliteArticleRepository(db)
		authors := adapters.NewSQLliteAuthorsRepository(db)
		tags = adapters.NewSQLliteTagsRepository(db)
		users = adapters.NewSQLiteUserRepository(db)
		tenants = adapters.NewSQLiteTenantRepository(db)
		memberships = adapters.NewSQLiteMembershipRepository(db)

		log.Println("Using SQLite database")

		jwtSvc := security.NewJWTService(cfg.JWT.SecretKey, cfg.JWT.Issuer, cfg.JWT.AccessTTL)

		meilisearchAPIKey := os.Getenv("MEILISEARCH_API_KEY")
		meilisearchHost := os.Getenv("MEILISEARCH_HOST")
		if meilisearchHost == "" {
			meilisearchHost = "http://localhost:7700"
		}
		engine := adapters.Init(meilisearchHost, meilisearchAPIKey)

		sync := search.NewIndexSyncManager(engine, articles, tags)

		rateLimiter := middleware.NewRateLimiter(cfg.RateLimit.SearchLimit)
		rateLimiter.Cleanup(5 * time.Minute)

		authMiddleware := middleware.NewAuthMiddleware(jwtSvc, users)

		r := gin.Default()

		r.Use(cors.New(cors.Config{
			AllowOrigins:     []string{"*"},
			AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
			ExposeHeaders:    []string{"Content-Length"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}))

		handlers.SetupSwagger(r)

		ttlaccess := int64(cfg.JWT.AccessTTL.Seconds())

		r.POST("/auth/register", handlers.Register(users, tenants, memberships, jwtSvc, ttlaccess))
		r.POST("/auth/login", handlers.Login(users, jwtSvc, ttlaccess))
		r.POST("/auth/refresh", handlers.RefreshToken(jwtSvc, ttlaccess))

		r.GET("/api/me", authMiddleware.RequireAuth(), handlers.GetCurrentUser(users))

		r.POST("/articles", handlers.AddArticle(articles, authors, tags, sync))
		r.POST("/articles/batch", handlers.AddArticles(articles, authors, tags, sync))

		r.POST("/authors", handlers.AddAuthor(authors))
		r.POST("/authors/batch", handlers.AddAuthors(authors))

		r.POST("/tags", handlers.AddTag(tags))
		r.PATCH("/tags/:label", handlers.UpdateTagWithLabel(tags, sync))
		r.POST("/tags/batch", handlers.AddTagsInBatch(tags))
		r.GET("/tags", handlers.ListAllTags(tags))
		r.GET("/tags/:label", handlers.GetTagByLabel(tags))
		r.GET("/tags/:label/articles", handlers.FindArticlesByLabels(articles, tags))

		r.GET("/search", rateLimiter.Middleware(), handlers.SearchArticles(engine))

		log.Printf("Starting server on port %s", cfg.Server.Port)
		r.Run(":" + cfg.Server.Port)
	}
}
