import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { conversationDto, messageDto, messagesQuery, okResponse, sendMessageBody } from '../dto.js';
import { ChatService, toMessageDto } from './service.js';

const params = z.object({ conversationId: z.string().uuid() });

export const chatRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const chat = new ChatService(ctx);

  app.get('/conversations', { preHandler: [app.authenticate], schema: { tags: ['chat'], response: { 200: z.array(conversationDto) } } }, async (req) =>
    chat.listForUser(req.user.id),
  );

  app.get(
    '/conversations/:conversationId/messages',
    { preHandler: [app.authenticate], schema: { tags: ['chat'], params, querystring: messagesQuery, response: { 200: z.array(messageDto) } } },
    async (req) => {
      await chat.getForMember(req.params.conversationId, req.user.id);
      const rows = await chat.messages(req.params.conversationId, req.query);
      return rows.map(toMessageDto);
    },
  );

  app.post(
    '/conversations/:conversationId/messages',
    { preHandler: [app.authenticate], schema: { tags: ['chat'], params, body: sendMessageBody, response: { 201: messageDto } } },
    async (req, reply) => {
      await chat.getForMember(req.params.conversationId, req.user.id);
      const m = await chat.send(req.params.conversationId, req.user.id, req.body.body);
      return reply.code(201).send(toMessageDto(m));
    },
  );

  app.post('/conversations/:conversationId/read', { preHandler: [app.authenticate], schema: { tags: ['chat'], params, response: { 200: okResponse } } }, async (req) => {
    await chat.getForMember(req.params.conversationId, req.user.id);
    await chat.markRead(req.params.conversationId, req.user.id);
    return { ok: true as const };
  });
};
