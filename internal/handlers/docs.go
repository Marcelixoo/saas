package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func SetupSwagger(r *gin.Engine) {
	r.GET("/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler,
		ginSwagger.URL("/swagger.yaml"),
		ginSwagger.DefaultModelsExpandDepth(-1),
		ginSwagger.PersistAuthorization(true),
	))

	r.StaticFile("/swagger.yaml", "./docs/swagger.yaml")

	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/docs/index.html")
	})

	r.GET("/api", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"name":    "Fashion Catalog API",
			"version": "1.0.0",
			"docs":    "/docs/index.html",
			"spec":    "/swagger.yaml",
			"endpoints": gin.H{
				"auth": gin.H{
					"register": "POST /auth/register",
					"login":    "POST /auth/login",
					"refresh":  "POST /auth/refresh",
					"me":       "GET /api/me",
				},
				"articles": gin.H{
					"create":      "POST /articles",
					"createBatch": "POST /articles/batch",
				},
				"authors": gin.H{
					"create":      "POST /authors",
					"createBatch": "POST /authors/batch",
				},
				"tags": gin.H{
					"list":           "GET /tags",
					"get":            "GET /tags/:label",
					"create":         "POST /tags",
					"update":         "PATCH /tags/:label",
					"createBatch":    "POST /tags/batch",
					"findByArticles": "GET /tags/:label/articles",
				},
				"search": gin.H{
					"search": "GET /search",
				},
			},
		})
	})
}
