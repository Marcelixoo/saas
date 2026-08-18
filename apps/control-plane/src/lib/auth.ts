import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from './errors';

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const payload = await request.jwtVerify<{ sub: string; email: string }>();
    request.authUser = { id: payload.sub, email: payload.email };
  } catch {
    throw Errors.unauthenticated();
  }
}
