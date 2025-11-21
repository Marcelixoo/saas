package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server    ServerConfig
	Database  DatabaseConfig
	JWT       JWTConfig
	RateLimit RateLimitConfig
}

type ServerConfig struct {
	Port string
}

type DatabaseConfig struct {
	Path string
}

type JWTConfig struct {
	SecretKey  string
	Issuer     string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

type RateLimitConfig struct {
	SearchLimit int
}

func Load() (*Config, error) {
	jwtSecret := os.Getenv("JWT_SECRET_KEY")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET_KEY environment variable is required")
	}

	accessTTL := parseDuration(os.Getenv("JWT_ACCESS_TTL"), 24*time.Hour)
	refreshTTL := parseDuration(os.Getenv("JWT_REFRESH_TTL"), 7*24*time.Hour)

	searchLimit := parseInt(os.Getenv("SEARCH_RATE_LIMIT"), 60)

	return &Config{
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
		},
		Database: DatabaseConfig{
			Path: getEnv("DATABASE_PATH", "file:articles.db?cache=shared&mode=memory"),
		},
		JWT: JWTConfig{
			SecretKey:  jwtSecret,
			Issuer:     getEnv("JWT_ISSUER", "fashion-catalog"),
			AccessTTL:  accessTTL,
			RefreshTTL: refreshTTL,
		},
		RateLimit: RateLimitConfig{
			SearchLimit: searchLimit,
		},
	}, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func parseInt(value string, defaultValue int) int {
	if value == "" {
		return defaultValue
	}
	if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
		return parsed
	}
	return defaultValue
}

func parseDuration(value string, defaultValue time.Duration) time.Duration {
	if value == "" {
		return defaultValue
	}
	if parsed, err := time.ParseDuration(value); err == nil {
		return parsed
	}
	return defaultValue
}
