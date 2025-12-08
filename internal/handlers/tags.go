package handlers

import (
	"context"
	"fmt"
	"mini-search-platform/internal/models"
	"mini-search-platform/internal/search"
	"mini-search-platform/pkg/errors"
	"mini-search-platform/pkg/retry"

	"github.com/gin-gonic/gin"
)

type TagInput struct {
	Label string `json:"label" binding:"required"`
}

type AddTagsInBatchSummary struct {
	TotalInserted int `json:"total_inserted"`
	TotalFailed   int `json:"total_failed"`
}

type AddTagsInBatchResponse struct {
	Summary  AddTagsInBatchSummary `json:"summary"`
	Inserted []*models.Tag         `json:"inserted"`
	Failed   []map[string]TagInput `json:"failed"`
}

func AddTagsInBatch(repository models.TagsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var inputs []TagInput
		if err := c.ShouldBindJSON(&inputs); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		var inserted []*models.Tag
		var failed = []map[string]TagInput{}
		for _, input := range inputs {
			tag := models.NewTag(input.Label)

			lastInsertedId, err := repository.Save(tag)
			if err != nil {
				failed = append(failed, map[string]TagInput{
					err.Error(): input,
				})
				continue
			}

			tag.ID = lastInsertedId
			inserted = append(inserted, tag)
		}

		c.JSON(201, AddTagsInBatchResponse{
			Summary: AddTagsInBatchSummary{
				TotalInserted: len(inserted),
				TotalFailed:   len(failed),
			},
			Inserted: inserted,
			Failed:   failed,
		})
	}
}

func AddTag(repository models.TagsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {

		var input TagInput
		if err := c.ShouldBindJSON(&input); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		tag := models.NewTag(input.Label)

		lastInsertedId, err := repository.Save(tag)
		if err != nil {
			errors.Handle(c, errors.Database("failed to insert new tag", err))
			return
		}

		retrieved, _ := repository.FindById(lastInsertedId)

		c.JSON(201, retrieved)
	}
}

type UpdateTagInput struct {
	NewLabel string `json:"label" binding:"required"`
}

func UpdateTagWithLabel(repository models.TagsRepository, sync *search.IndexSyncManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		label := c.Param("label")

		var input UpdateTagInput
		if err := c.ShouldBindJSON(&input); err != nil {
			errors.Handle(c, errors.Validation(err.Error()))
			return
		}

		tag, err := repository.FindByLabel(label)
		if err != nil {
			errors.Handle(c, errors.NotFound(fmt.Sprintf("tag '%s'", label)))
			return
		}

		tag.Update(input.NewLabel)

		lastInsertedId, err := repository.Save(tag)
		if err != nil {
			errors.Handle(c, errors.Database(fmt.Sprintf("failed to update tag '%s'", tag.Label), err))
			return
		}

		retrieved, _ := repository.FindById(lastInsertedId)

		resync := func(tagToSync *models.Tag) error {
			operation := func() error {
				return sync.SyncAfterTagsChanged(tagToSync)
			}
			return retry.WithBackoff(context.Background(), operation)
		}
		go resync(retrieved)

		c.JSON(200, retrieved)
	}
}

func ListAllTags(repository models.TagsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		tags, err := repository.FindAll()
		if err != nil {
			errors.Handle(c, errors.Database("failed to fetch tags", err))
			return
		}

		c.JSON(200, tags)
	}
}

func GetTagByLabel(repository models.TagsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		label := c.Param("label")
		tag, err := repository.FindByLabel(label)
		if err != nil {
			errors.Handle(c, errors.NotFound(fmt.Sprintf("tag '%s'", label)))
			return
		}

		c.JSON(200, tag)
	}
}

func FindArticlesByLabels(articlesRepository models.ArticleRepository, tagsRepository models.TagsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		label := c.Param("label")
		if label == "" {
			errors.Handle(c, errors.Validation("label is required"))
			return
		}

		tag, err := tagsRepository.FindByLabel(label)
		if err != nil {
			errors.Handle(c, errors.NotFound(fmt.Sprintf("tag '%s'", label)))
			return
		}

		articles, err := articlesRepository.FindByTag(tag)
		if err != nil {
			errors.Handle(c, errors.Database(fmt.Sprintf("could not find articles with tag %s", tag.Label), err))
			return
		}

		c.JSON(200, articles)
	}
}
