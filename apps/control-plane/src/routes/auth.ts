import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { Errors } from '../lib/errors';
import { isEmailAllowed } from '../config';
import { requireAuth } from '../lib/auth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { email, password, name } = parsed.data;

    if (!isEmailAllowed(email)) {
      throw Errors.unauthorized('This email is not permitted to register');
    }

    const existing = await app.deps.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw Errors.conflict('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await app.deps.prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash, name },
    });

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    reply.code(201).send({ user: { id: user.id, email: user.email, name: user.name }, token });
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { email, password } = parsed.data;

    const user = await app.deps.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      throw Errors.unauthenticated('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw Errors.unauthenticated('Invalid email or password');
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    reply.code(200).send({ user: { id: user.id, email: user.email, name: user.name }, token });
  });

  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await app.deps.prisma.user.findUnique({ where: { id: request.authUser!.id } });
    if (!user) {
      throw Errors.notFound('User not found');
    }
    reply.code(200).send({ id: user.id, email: user.email, name: user.name });
  });
}
