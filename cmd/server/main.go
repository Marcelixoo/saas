package main

import (
	"log"
	"mini-search-platform/internal"
	"mini-search-platform/internal/adapters"
	"mini-search-platform/internal/handlers"
	"mini-search-platform/internal/middleware"
	"mini-search-platform/internal/search"
	"mini-search-platform/pkg/security"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	deps, err := internal.NewDependencies()
	if err != nil {
		log.Fatalf("Failed to initialize dependencies: %v", err)
	}
	defer deps.Close()

	jwtSvc := security.NewJWTService(deps.Config.JWT.SecretKey, deps.Config.JWT.Issuer, deps.Config.JWT.AccessTTL)

	meilisearchHost := getEnvOrDefault("MEILISEARCH_HOST", "http://localhost:7700")
	meilisearchAPIKey := os.Getenv("MEILISEARCH_API_KEY")
	engine := adapters.Init(meilisearchHost, meilisearchAPIKey)

	sync := search.NewIndexSyncManager(engine, deps.Articles, deps.Tags)
	rateLimiter := middleware.NewRateLimiter(deps.Config.RateLimit.SearchLimit)
	rateLimiter.Cleanup(5 * time.Minute)
	authMiddleware := middleware.NewAuthMiddleware(jwtSvc, deps.Users)

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
	ttlaccess := int64(deps.Config.JWT.AccessTTL.Seconds())

	r.POST("/auth/register", handlers.Register(deps.Users, deps.Tenants, deps.Memberships, jwtSvc, ttlaccess))
	r.POST("/auth/login", handlers.Login(deps.Users, jwtSvc, ttlaccess))
	r.POST("/auth/refresh", handlers.RefreshToken(jwtSvc, ttlaccess))
	r.GET("/api/me", authMiddleware.RequireAuth(), handlers.GetCurrentUser(deps.Users))
	r.POST("/articles", handlers.AddArticle(deps.Articles, deps.Authors, deps.Tags, sync))
	r.POST("/articles/batch", handlers.AddArticles(deps.Articles, deps.Authors, deps.Tags, sync))
	r.POST("/authors", handlers.AddAuthor(deps.Authors))
	r.POST("/authors/batch", handlers.AddAuthors(deps.Authors))
	r.POST("/tags", handlers.AddTag(deps.Tags))
	r.PATCH("/tags/:label", handlers.UpdateTagWithLabel(deps.Tags, sync))
	r.POST("/tags/batch", handlers.AddTagsInBatch(deps.Tags))
	r.GET("/tags", handlers.ListAllTags(deps.Tags))
	r.GET("/tags/:label", handlers.GetTagByLabel(deps.Tags))
	r.GET("/tags/:label/articles", handlers.FindArticlesByLabels(deps.Articles, deps.Tags))
	r.GET("/search", rateLimiter.Middleware(), handlers.SearchArticles(engine))

	log.Printf("Starting server on port %s", deps.Config.Server.Port)
	r.Run(":" + deps.Config.Server.Port)
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
