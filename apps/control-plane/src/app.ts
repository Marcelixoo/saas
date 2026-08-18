import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config';
import { ApiError, errorBody } from './lib/errors';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import type { AppDeps } from './types';

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.decorate('deps', deps);

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

  app.register(authRoutes);
  app.register(organizationRoutes);

  return app;
}
