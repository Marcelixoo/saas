# k8s build of apps/control-plane. Behaviorally identical to
# apps/control-plane/Dockerfile (owned by Agent A) except:
#   1. it also trusts any CA cert dropped into infra/docker/certs/*.pem
#      before running npm — needed when building behind a TLS-intercepting
#      corporate egress proxy (npm's prisma postinstall step fetches engine
#      binaries over HTTPS and fails silently otherwise). certs/ is
#      empty/gitignored by default — see infra/README.md.
#   2. it uses node:20-bookworm-slim (Debian) instead of node:20-alpine.
#      Prisma's musl/OpenSSL auto-detection inside recent Alpine images
#      (Alpine 3.23 ships OpenSSL 3 only) mis-detects "openssl-1.1.x" and
#      fetches an engine binary that fails to load at container runtime
#      ("Could not parse schema engine response") — a known Prisma+Alpine
#      compatibility gap. Debian's OpenSSL detection is unambiguous.
# apps/control-plane/Dockerfile itself is untouched. Build context MUST be
# the repo root (so infra/docker/certs is reachable):
#
#   docker build -f infra/docker/control-plane.Dockerfile \
#     -t saas/control-plane:local .

# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY infra/docker/certs/ /tmp/extra-certs/
RUN for f in /tmp/extra-certs/*.pem; do \
      [ -e "$f" ] && cp "$f" "/usr/local/share/ca-certificates/$(basename "$f" .pem).crt"; \
    done; \
    update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
COPY apps/control-plane/package.json apps/control-plane/package-lock.json ./
COPY apps/control-plane/prisma ./prisma
RUN npm ci --registry=https://registry.npmjs.org --userconfig /dev/null --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY infra/docker/certs/ /tmp/extra-certs/
RUN for f in /tmp/extra-certs/*.pem; do \
      [ -e "$f" ] && cp "$f" "/usr/local/share/ca-certificates/$(basename "$f" .pem).crt"; \
    done; \
    update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
COPY --from=deps /app/node_modules ./node_modules
COPY apps/control-plane/. .
RUN ./node_modules/.bin/prisma generate
RUN ./node_modules/.bin/tsc -p tsconfig.json

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY infra/docker/certs/ /tmp/extra-certs/
RUN for f in /tmp/extra-certs/*.pem; do \
      [ -e "$f" ] && cp "$f" "/usr/local/share/ca-certificates/$(basename "$f" .pem).crt"; \
    done; \
    update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
COPY apps/control-plane/package.json apps/control-plane/package-lock.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org --userconfig /dev/null --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY apps/control-plane/prisma ./prisma

EXPOSE 8080

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/server.js"]
