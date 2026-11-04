import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { membershipDto, okResponse, paymentDto } from '../dto.js';
import { toPaymentDto } from '../events/service.js';
import { FakePaymentProvider } from './fake.js';
import { PaymentService } from './service.js';

export const paymentRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const payments = new PaymentService(ctx);

  // Raw body is needed for Stripe signature verification.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.post('/payments/webhook', { schema: { tags: ['payments'], hide: true } }, async (req, reply) => {
    try {
      await payments.handleWebhook(req.body as Buffer, req.headers['stripe-signature'] as string | undefined);
    } catch (err) {
      ctx.log.warn({ err }, 'webhook rejected');
      return reply.code(400).send({ error: { code: 'bad_webhook', message: 'Invalid webhook' } });
    }
    return reply.send({ received: true });
  });
};

export const paymentJsonRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const payments = new PaymentService(ctx);

  app.get(
    '/payments/:paymentId',
    { preHandler: [app.authenticate], schema: { tags: ['payments'], params: z.object({ paymentId: z.string().uuid() }), response: { 200: paymentDto } } },
    async (req) => {
      const p = await ctx.db.selectFrom('payments').selectAll().where('id', '=', req.params.paymentId).executeTakeFirst();
      if (!p || p.user_id !== req.user.id) throw errors.notFound('Payment');
      return toPaymentDto(p);
    },
  );

  // Development only: simulate the provider confirming a payment.
  if (ctx.payments instanceof FakePaymentProvider) {
    const fake = ctx.payments;
    app.post(
      '/payments/:paymentId/dev-complete',
      { preHandler: [app.authenticate], schema: { tags: ['payments'], params: z.object({ paymentId: z.string().uuid() }), response: { 200: okResponse } } },
      async (req) => {
        const p = await ctx.db.selectFrom('payments').selectAll().where('id', '=', req.params.paymentId).executeTakeFirst();
        if (!p || p.user_id !== req.user.id || !p.provider_ref) throw errors.notFound('Payment');
        fake.complete(p.provider_ref);
        return { ok: true as const };
      },
    );
  }

  app.get('/membership', { preHandler: [app.authenticate], schema: { tags: ['payments'], response: { 200: membershipDto.nullable() } } }, async (req) => {
    const s = await payments.myMembership(req.user.id);
    return s ? payments.toMembershipDto(s) : null;
  });

  app.post('/membership', { preHandler: [app.authenticate], schema: { tags: ['payments'], response: { 201: membershipDto } } }, async (req, reply) => {
    const { subscription, clientSecret } = await payments.subscribe(req.user);
    return reply.code(201).send(payments.toMembershipDto(subscription, clientSecret));
  });

  app.delete('/membership', { preHandler: [app.authenticate], schema: { tags: ['payments'], response: { 200: membershipDto } } }, async (req) =>
    payments.toMembershipDto(await payments.cancelMembership(req.user)),
  );
};
