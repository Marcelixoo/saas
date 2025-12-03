package database

import "database/sql"

func Create(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS tenants (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS memberships (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('admin', 'billing', 'member')),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
			UNIQUE(user_id, tenant_id)
		);

		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			name TEXT NOT NULL,
			tier TEXT NOT NULL CHECK(tier IN ('free', 'premium')) DEFAULT 'free',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS authors (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS articles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			author_id INTEGER NOT NULL,
			project_id TEXT,
			tenant_id TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (author_id) REFERENCES author (id),
			FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
			FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			label TEXT NOT NULL UNIQUE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS article_tags (
			article_id INTEGER NOT NULL,
			tag_id INTEGER NOT NULL,
			PRIMARY KEY (article_id, tag_id),
			FOREIGN KEY (article_id) REFERENCES articles (id),
			FOREIGN KEY (tag_id) REFERENCES tags (id)
		);

		CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
		CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);
		CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
		CREATE INDEX IF NOT EXISTS idx_articles_project ON articles(project_id);
		CREATE INDEX IF NOT EXISTS idx_articles_tenant ON articles(tenant_id);
	`)

	return err
}
