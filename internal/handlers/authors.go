package handlers

import (
	"mini-search-platform/internal/models"
	"mini-search-platform/pkg/errors"

	"github.com/gin-gonic/gin"
)

type AuthorsRepository interface {
	Save(*models.Author) (int, error)
}

type AuthorInput struct {
	Name     string `json:"name" binding:"required"`
	AuthorID int    `json:"author_id"`
}

type AddAuthorsSummary struct {
	TotalInserted int `json:"total_inserted"`
	TotalFailed   int `json:"total_failed"`
}

type AddAuthorsResponse struct {
	Summary  AddAuthorsSummary          `json:"summary"`
	Inserted []models.Author            `json:"inserted"`
	Failed   []map[string]models.Author `json:"failed"`
}

func AddAuthors(repository AuthorsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var inputs []AuthorInput
		if err := c.ShouldBindJSON(&inputs); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		var inserted []models.Author
		var failed = []map[string]models.Author{}
		for _, input := range inputs {
			author := models.NewAuthor(input.AuthorID, input.Name)

			lastInsertedId, err := repository.Save(author)
			if err != nil {
				failed = append(failed, map[string]models.Author{
					err.Error(): *author,
				})
				continue
			}

			author.ID = lastInsertedId
			inserted = append(inserted, *author)
		}

		c.JSON(201, AddAuthorsResponse{
			Summary: AddAuthorsSummary{
				TotalInserted: len(inserted),
				TotalFailed:   len(failed),
			},
			Inserted: inserted,
			Failed:   failed,
		})
	}
}

func AddAuthor(repository AuthorsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input AuthorInput
		if err := c.ShouldBindJSON(&input); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		author := models.NewAuthor(input.AuthorID, input.Name)

		lastInsertedId, err := repository.Save(author)
		if err != nil {
			errors.Handle(c, errors.Database("failed to insert author", err))
			return
		}

		author.ID = lastInsertedId

		c.JSON(201, author)
	}
}
