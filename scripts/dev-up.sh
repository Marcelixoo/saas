#!/bin/bash
# Convenience wrapper for the local developer environment.
#
# Usage:
#   scripts/dev-up.sh          # data tier + Go search-api (always available)
#   scripts/dev-up.sh full     # also brings up control-plane + web
#                               # (requires apps/control-plane/Dockerfile and
#                               # apps/web/Dockerfile from Agent A / Agent D)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found, copying .env.example -> .env"
  cp .env.example .env
fi

if [ "${1:-}" = "full" ]; then
  echo "Starting full stack (postgres, redis, meilisearch, search-api, control-plane, web)..."
  docker compose --profile full up --build
else
  echo "Starting data tier + search-api (postgres, redis, meilisearch, search-api)..."
  docker compose up --build
fi
