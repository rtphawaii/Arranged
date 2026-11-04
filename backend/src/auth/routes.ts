import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppContext } from '../context.js';
import { okResponse, refreshBody, requestOtpBody, requestOtpResponse, tokensSchema, verifyOtpBody, verifyOtpResponse } from '../modules/dto.js';
import { UserService } from '../modules/users/service.js';

export const authRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const users = new UserService(ctx);

  app.post(
    '/auth/otp/request',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: { tags: ['auth'], body: requestOtpBody, response: { 200: requestOtpResponse } },
    },
    async (req) => ctx.auth.requestOtp(req.body.phone),
  );

  app.post(
    '/auth/otp/verify',
    {
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: { tags: ['auth'], body: verifyOtpBody, response: { 200: verifyOtpResponse } },
    },
    async (req) => {
      const result = await ctx.auth.verifyOtp(req.body.phone, req.body.code);
      return { user: await users.toDto(result.user), isNewUser: result.isNewUser, tokens: result.tokens };
    },
  );

  app.post('/auth/refresh', { schema: { tags: ['auth'], body: refreshBody, response: { 200: tokensSchema } } }, async (req) =>
    ctx.auth.refresh(req.body.refreshToken),
  );

  app.post('/auth/logout', { schema: { tags: ['auth'], body: refreshBody, response: { 200: okResponse } } }, async (req) => {
    await ctx.auth.logout(req.body.refreshToken);
    return { ok: true as const };
  });
};
