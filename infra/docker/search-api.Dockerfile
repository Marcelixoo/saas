# k8s build of the Go search-api that compiles with `-mod=vendor` so the
# image build never needs outbound network access to the Go module proxy
# (the environment used to build this deployment sits behind a TLS-
# intercepting egress proxy that Go's module fetcher does not trust).
# This mirrors the root Dockerfile (owned by Agent B) exactly, aside from
# that one flag, and lives under infra/ so the root Dockerfile stays
# untouched.
#
# Build from the repo root, after `go mod vendor`:
#   go mod vendor
#   docker build -f infra/docker/search-api.Dockerfile -t saas/search-api:local .

FROM golang:1.25-alpine AS builder

WORKDIR /build

RUN apk add --no-cache git ca-certificates tzdata gcc musl-dev sqlite-dev

COPY go.mod go.sum ./
COPY vendor ./vendor
COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -mod=vendor -a -installsuffix cgo -ldflags="-w -s" -o server ./cmd/server/main.go

FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata sqlite-libs wget

WORKDIR /app

COPY --from=builder /build/server .
COPY --from=builder /build/docs ./docs

RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser && \
    mkdir -p /app/data && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8081

ENV GIN_MODE=release

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${SERVER_PORT:-8081}/api/me || exit 1

CMD ["./server"]
