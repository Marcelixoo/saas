package adapters

import (
	"database/sql"
	"fmt"
	"mini-search-platform/internal/models"
	"strings"
)

type PostgresAuthorsRepository struct {
	db *sql.DB
}

func NewPostgresAuthorsRepository(db *sql.DB) *PostgresAuthorsRepository {
	return &PostgresAuthorsRepository{db: db}
}

func (r *PostgresAuthorsRepository) Save(author *models.Author) (int, error) {
	query := `
		INSERT INTO authors (
			id,
			name,
			created_at
		) VALUES ($1, $2, $3)
		RETURNING id
	`

	var id int
	err := r.db.QueryRow(query,
		author.ID,
		author.Name,
		author.CreatedAt,
	).Scan(&id)
	if err != nil {
		return 0, err
	}

	return id, nil
}

func (r *PostgresAuthorsRepository) FindAuthorById(id int) (*models.Author, error) {
	query := `
		SELECT id, name, created_at
		FROM authors
		WHERE id = $1
	`
	row := r.db.QueryRow(query, id)

	var author models.Author
	err := row.Scan(&author.ID, &author.Name, &author.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &author, nil
}

type PostgresArticleRepository struct {
	db *sql.DB
}

func NewPostgresArticleRepository(db *sql.DB) *PostgresArticleRepository {
	return &PostgresArticleRepository{db: db}
}

func (r *PostgresArticleRepository) Save(article *models.Article) (int, error) {
	query := `
		INSERT INTO articles (
			title,
			body,
			author_id,
			created_at
		) VALUES ($1, $2, $3, $4)
		RETURNING id
	`

	tx, err := r.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var lastInsertedId int
	err = tx.QueryRow(query,
		article.Title,
		article.Body,
		article.AuthorID,
		article.CreatedAt,
	).Scan(&lastInsertedId)
	if err != nil {
		return 0, err
	}

	query = `
		INSERT INTO article_tags (article_id, tag_id)
		VALUES ($1, $2)
	`

	for _, tag := range article.Tags {
		_, err := tx.Exec(query, lastInsertedId, tag.ID)
		if err != nil {
			return 0, err
		}
	}

	err = tx.Commit()
	if err != nil {
		return 0, err
	}

	return lastInsertedId, nil
}

func (r *PostgresArticleRepository) FindByTag(tag *models.Tag) ([]*models.Article, error) {
	query := `
		SELECT
			a.id,
			a.title,
			a.body,
			a.author_id,
			au.name,
			a.created_at,
			t.id,
			t.label,
			t.created_at,
			t.updated_at
		FROM articles a
		JOIN authors au ON a.author_id = au.id
		JOIN tags t ON at.tag_id = t.id
		JOIN article_tags at ON a.id = at.article_id
		WHERE a.id IN (
			SELECT at.article_id
			FROM article_tags at
			WHERE at.tag_id = $1
		)
	`

	rows, err := r.db.Query(query, tag.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	articleMap := make(map[int]*models.Article)

	for rows.Next() {
		var (
			articleID                            int
			title, body                          string
			authorID                             int
			authorName, createdAt                string
			tagID                                int
			tagLabel, tagCreatedAt, tagUpdatedAt string
		)

		err := rows.Scan(
			&articleID, &title, &body,
			&authorID, &authorName, &createdAt,
			&tagID, &tagLabel, &tagCreatedAt, &tagUpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		article, exists := articleMap[articleID]
		if !exists {
			article = &models.Article{
				ID:        articleID,
				Title:     title,
				Body:      body,
				AuthorID:  authorID,
				Author:    authorName,
				CreatedAt: createdAt,
				Tags:      []*models.Tag{},
			}
			articleMap[articleID] = article
		}

		article.Tags = append(article.Tags, &models.Tag{
			ID:        tagID,
			Label:     tagLabel,
			CreatedAt: tagCreatedAt,
			UpdatedAt: tagUpdatedAt,
		})
	}

	var articles []*models.Article
	for _, a := range articleMap {
		articles = append(articles, a)
	}

	return articles, nil
}

type PostgresTagsRepository struct {
	db *sql.DB
}

func NewPostgresTagsRepository(db *sql.DB) *PostgresTagsRepository {
	return &PostgresTagsRepository{db: db}
}

func (r *PostgresTagsRepository) Save(tag *models.Tag) (int, error) {
	query := `
		INSERT INTO tags (label, updated_at, created_at)
		VALUES ($1, $2, $3)
		ON CONFLICT(label) DO UPDATE SET
			label = $4,
			updated_at = $5
		RETURNING id
	`

	var id int
	err := r.db.QueryRow(query,
		tag.Label,
		tag.UpdatedAt,
		tag.CreatedAt,
		tag.Label,
		tag.UpdatedAt,
	).Scan(&id)
	if err != nil {
		return 0, err
	}

	return id, nil
}

func (r *PostgresTagsRepository) FindByLabel(label string) (*models.Tag, error) {
	query := `
		SELECT id, label, created_at, updated_at
		FROM tags
		WHERE label = $1
	`
	row := r.db.QueryRow(query, label)

	var tag models.Tag
	err := row.Scan(&tag.ID, &tag.Label, &tag.CreatedAt, &tag.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &tag, nil
}

func (r *PostgresTagsRepository) FindByLabels(labels []string) ([]*models.Tag, error) {
	if len(labels) == 0 {
		return nil, nil
	}

	placeholders := make([]string, len(labels))
	args := make([]interface{}, len(labels))
	for i, label := range labels {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = label
	}

	query := fmt.Sprintf(`
		SELECT id, label, created_at, updated_at
		FROM tags
		WHERE label IN (%s)
	`, strings.Join(placeholders, ","))

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []*models.Tag
	for rows.Next() {
		var tag models.Tag
		err := rows.Scan(&tag.ID, &tag.Label, &tag.CreatedAt, &tag.UpdatedAt)
		if err != nil {
			return nil, err
		}
		tags = append(tags, &tag)
	}

	return tags, nil
}

func (r *PostgresTagsRepository) FindById(id int) (*models.Tag, error) {
	query := `
		SELECT id, label, created_at, updated_at
		FROM tags
		WHERE id = $1
	`
	row := r.db.QueryRow(query, id)

	var tag models.Tag
	err := row.Scan(&tag.ID, &tag.Label, &tag.CreatedAt, &tag.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &tag, nil
}

func (r *PostgresTagsRepository) FindAll() ([]*models.Tag, error) {
	query := `
		SELECT id, label, created_at, updated_at
		FROM tags
	`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []*models.Tag
	for rows.Next() {
		var tag models.Tag
		err := rows.Scan(&tag.ID, &tag.Label, &tag.CreatedAt, &tag.UpdatedAt)
		if err != nil {
			return nil, err
		}
		tags = append(tags, &tag)
	}

	return tags, nil
}
