package postgres

import (
	"database/sql"
	"time"

	_ "github.com/lib/pq"
)

func Init(connectionString string) (*sql.DB, error) {
	db, err := sql.Open("postgres", connectionString)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(10 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

func Close(db *sql.DB) error {
	if db != nil {
		return db.Close()
	}
	return nil
}
