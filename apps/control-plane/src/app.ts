import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { config } from './config';
import { ApiError, errorBody } from './lib/errors';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import type { AppDeps } from './types';

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.decorate('deps', deps);

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
