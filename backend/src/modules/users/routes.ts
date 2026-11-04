import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { okResponse, registerDeviceBody, updateProfileBody, userDto } from '../dto.js';
import { UserService } from './service.js';

export const userRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const users = new UserService(ctx);

  app.get('/me', { preHandler: [app.authenticate], schema: { tags: ['users'], response: { 200: userDto } } }, async (req) =>
    users.toDto(req.user),
  );

  app.patch(
    '/me',
    { preHandler: [app.authenticate], schema: { tags: ['users'], body: updateProfileBody, response: { 200: userDto } } },
    async (req) => users.toDto(await users.updateProfile(req.user, req.body)),
  );

  app.delete('/me', { preHandler: [app.authenticate], schema: { tags: ['users'], response: { 200: okResponse } } }, async (req) => {
    await users.deleteAccount(req.user);
    return { ok: true as const };
  });

  app.post(
    '/me/devices',
    { preHandler: [app.authenticate], schema: { tags: ['users'], body: registerDeviceBody, response: { 200: okResponse } } },
    async (req) => {
      await users.registerDevice(req.user, req.body);
      return { ok: true as const };
    },
  );

  app.post(
    '/users/:userId/block',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['users'],
        params: z.object({ userId: z.string().uuid() }),
        body: z.object({ reason: z.string().max(500).nullable().default(null) }),
        response: { 200: okResponse },
      },
    },
    async (req) => {
      await users.blockUser(req.user, req.params.userId, req.body.reason);
      return { ok: true as const };
    },
  );
};
