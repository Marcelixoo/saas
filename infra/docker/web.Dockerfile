# k8s-specific build of apps/web that bakes NEXT_PUBLIC_API_URL in at build
# time (Next.js only reads NEXT_PUBLIC_* env vars during `next build`, never
# at container runtime). This file lives under infra/ (Agent E's ownership)
# so apps/web/Dockerfile (Agent D's ownership) is left untouched.
#
# The value MUST be the control-plane URL reachable from the assessor's
# BROWSER (the Traefik ingress host), because the Next.js Admin UI runs
# client-side in that browser and calls the control-plane directly — never
# the in-cluster DNS name (http://control-plane:8080), which the browser
# cannot resolve. See infra/README.md.
#
# Build from the repo root (build context MUST be the repo root so
# infra/docker/certs is reachable):
#   docker build -f infra/docker/web.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://api.localtest.me:8088 \
#     -t saas/web:local .

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY infra/docker/certs/ /tmp/extra-certs/
RUN for f in /tmp/extra-certs/*.pem; do \
      [ -e "$f" ] && cp "$f" "/usr/local/share/ca-certificates/$(basename "$f" .pem).crt"; \
    done; \
    update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --registry=https://registry.npmjs.org --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/. .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
