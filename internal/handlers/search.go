package handlers

import (
	"mini-search-platform/internal/search"
	"mini-search-platform/pkg/errors"

	"github.com/gin-gonic/gin"
	"github.com/mcuadros/go-defaults"
)

type SearchQueryParams struct {
	Query  string `form:"q" binding:"required"`
	Limit  int    `form:"limit" default:"10"`
	Offset int    `form:"offset" default:"0"`
	Filter string `form:"filter" default:""`
	Sort   string `form:"sort" default:"title:asc"`
	Facets string `form:"facets" default:""`
}

func SearchArticles(engine search.SearchEngine) gin.HandlerFunc {
	return func(c *gin.Context) {
		var params SearchQueryParams

		defaults.SetDefaults(&params)

		if err := c.ShouldBindQuery(&params); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		articles, err := engine.Search(params.Query, search.SearchOptions{
			Limit:  params.Limit,
			Offset: params.Offset,
			Filter: params.Filter,
			Sort:   []string{params.Sort},
		})
		if err != nil {
			errors.Handle(c, errors.Search("failed to search articles", err))
			return
		}

		c.JSON(200, articles)
	}
}
