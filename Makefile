.PHONY: help dev test test-integration test-unit build clean docker-up docker-down deploy-prod lint fmt

help:
	@echo "Available commands:"
	@echo "  make dev              - Start local development with Docker Postgres"
	@echo "  make test             - Run all tests"
	@echo "  make test-unit        - Run unit tests only"
	@echo "  make test-integration - Run integration tests with Docker"
	@echo "  make build            - Build the application"
	@echo "  make clean            - Clean build artifacts and stop Docker"
	@echo "  make docker-up        - Start Docker services"
	@echo "  make docker-down      - Stop Docker services"
	@echo "  make lint             - Run linters"
	@echo "  make fmt              - Format code"
	@echo "  make deploy-prod      - Deploy to production (GCP)"

dev: docker-up
	@echo "Starting development server..."
	@APP_ENV=development \
	JWT_SECRET_KEY=dev-secret-key \
	DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fashiondb?sslmode=disable \
	go run cmd/server/main.go

test: test-unit test-integration

test-unit:
	@echo "Running unit tests..."
	@go test -v -short ./...

test-integration: docker-up
	@echo "Running integration tests..."
	@APP_ENV=development \
	DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fashiondb?sslmode=disable \
	JWT_SECRET_KEY=test-secret-key \
	go test -v ./... -tags=integration

build:
	@echo "Building application..."
	@JWT_SECRET_KEY=build-dummy go build -o bin/server cmd/server/main.go
	@echo "Build complete: bin/server"

clean: docker-down
	@echo "Cleaning build artifacts..."
	@rm -rf bin/
	@rm -f *.db
	@go clean

docker-up:
	@echo "Starting Docker services..."
	@docker-compose up -d
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 3

docker-down:
	@echo "Stopping Docker services..."
	@docker-compose down

lint:
	@echo "Running linters..."
	@go vet ./...
	@golangci-lint run || echo "golangci-lint not installed, skipping"

fmt:
	@echo "Formatting code..."
	@go fmt ./...

deploy-prod:
	@echo "Deploying to production..."
	@git push origin main
	@echo "GitHub Actions will handle the deployment"

.DEFAULT_GOAL := help
