import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config';
import { ApiError, errorBody } from './lib/errors';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import { metricsRoutes } from './routes/metrics';
import { documentRoutes } from './routes/documents';
import { memberRoutes } from './routes/members';
import type { AppDeps } from './types';
import { classifySearchSli, SEARCH_SLI_LOG_MESSAGE, SEARCH_SLI_OPERATION } from './lib/searchSli';

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
}

export function buildApp(deps: AppDeps, options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

  app.decorate('deps', deps);
  app.decorateRequest('searchSli', null);

  // Registered before routes so preflight (OPTIONS) requests and the
  // Access-Control-Allow-* headers on real requests are handled for every
  // route below, including auth endpoints. The Admin UI (Next.js) is served
  // from a different origin than this API, so without CORS the browser
  // blocks all cross-origin calls even though curl/server-to-server calls
  // work fine.
  //
  // Auth here is via `Authorization: Bearer <token>`, not cookies, so
  // `credentials: true` is unnecessary and intentionally left off.
  app.register(cors, {
    // If CORS_ORIGINS is set, use it as an explicit allowlist (the intended
    // production posture). Otherwise, reflect the request's Origin header
    // for local-dev convenience.
    origin: config.corsOrigins ?? true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });

  // `sign.expiresIn` is applied to every `app.jwt.sign(...)` call unless
  // overridden per-call, so every issued token carries an `exp` claim and
  // `request.jwtVerify()` (see lib/auth.ts) rejects expired tokens with 401.
  app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: config.jwtExpiresIn } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send(errorBody(error.code, error.message));
      return;
    }
    if ((error as { validation?: unknown }).validation) {
      reply.code(400).send(errorBody('VALIDATION_ERROR', error.message));
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    reply.code(500).send(errorBody('INTERNAL_ERROR', 'An unexpected error occurred'));
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  // Customer-facing search SLI: one structured line per request that got
  // as far as a resolved organization (see docs/observability.md §5).
  // Tenant/plan are set by the search handler after resolveMembership so
  // a 429 still carries labels; 401s and other pre-tenant failures skip
  // this line because searchSli stays null.
  app.addHook('onResponse', async (request, reply) => {
    const sli = request.searchSli;
    if (!sli) return;
    request.log.info(
      {
        sli_operation: SEARCH_SLI_OPERATION,
        tenant_id: sli.tenantId,
        plan: sli.plan,
        latency_ms: Math.round(reply.elapsedTime),
        http_status: reply.statusCode,
        sli_result: classifySearchSli(reply.statusCode),
      },
      SEARCH_SLI_LOG_MESSAGE,
    );
  });

  app.register(authRoutes);
  app.register(organizationRoutes);
  app.register(metricsRoutes);
  app.register(documentRoutes);
  app.register(memberRoutes);

  return app;
}
