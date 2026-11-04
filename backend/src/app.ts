import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContext } from './context.js';
import { authPlugin } from './auth/plugin.js';
import { authRoutes } from './auth/routes.js';
import { AppError } from './lib/errors.js';
import { adminRoutes } from './modules/admin/routes.js';
import { bookingRoutes } from './modules/bookings/routes.js';
import { chatRoutes } from './modules/chat/routes.js';
import { cityRoutes } from './modules/cities/routes.js';
import { connectionRoutes } from './modules/connections/routes.js';
import { eventRoutes } from './modules/events/routes.js';
import { groupRoutes } from './modules/groups/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { paymentJsonRoutes, paymentRoutes } from './modules/payments/routes.js';
import { personalityRoutes } from './modules/personality/routes.js';
import { userRoutes } from './modules/users/routes.js';

export async function buildApp(ctx: AppContext, opts: { logger?: boolean | object } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: ctx.config.CORS_ORIGINS ? ctx.config.CORS_ORIGINS.split(',').map((s) => s.trim()) : false,
  });
  if (ctx.config.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  }

  await app.register(swagger, {
    openapi: {
      info: { title: 'Arranged API', version: '0.1.0', description: 'Dinner-matching backend used by the Arranged iOS app.' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });
  if (ctx.config.NODE_ENV !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(authPlugin, { jwt: ctx.jwt, db: ctx.db, adminApiToken: ctx.config.ADMIN_API_TOKEN });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError || (err as { validation?: unknown }).validation) {
      const issues = err instanceof ZodError ? err.issues : (err as { validation: unknown }).validation;
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid request', details: issues } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: { code: (err as { code?: string }).code ?? 'request_error', message: (err as Error).message } });
    }
    req.log.error({ err }, 'unhandled error');
    ctx.log.error({ err, url: req.url }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong' } });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Route not found' } }));

  const v1 = async (api: FastifyInstance) => {
    await api.register(authRoutes(ctx));
    await api.register(cityRoutes(ctx));
    await api.register(userRoutes(ctx));
    await api.register(personalityRoutes(ctx));
    await api.register(eventRoutes(ctx));
    await api.register(bookingRoutes(ctx));
    await api.register(paymentJsonRoutes(ctx));
    await api.register(paymentRoutes(ctx)); // raw-body webhook, isolated in its own plugin scope
    await api.register(groupRoutes(ctx));
    await api.register(connectionRoutes(ctx));
    await api.register(chatRoutes(ctx));
    await api.register(notificationRoutes(ctx));
    await api.register(adminRoutes(ctx));
  };
  await app.register(v1, { prefix: '/v1' });

  return app;
}
