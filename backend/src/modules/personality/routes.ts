import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { User } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { personalityProfileDto, questionsResponse, submitAnswersBody } from '../dto.js';
import { UserService, parseVector } from '../users/service.js';
import { DIMENSIONS, LIKERT_MAX, LIKERT_MIN, QUESTIONS, QUESTION_KEYS, computePersonalityVector, describeVector } from './questions.js';

export class PersonalityService {
  constructor(private readonly ctx: AppContext) {}

  async profile(user: User): Promise<z.infer<typeof personalityProfileDto>> {
    const answered = await this.ctx.db
      .selectFrom('personality_answers')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow();
    const vector = parseVector(user.personality_vector);
    return {
      completed: user.personality_completed_at !== null,
      answered: Number(answered.count),
      total: QUESTIONS.length,
      vector,
      dimensions: [...DIMENSIONS],
      labels: vector ? describeVector(vector) : [],
    };
  }

  /** Upserts answers; the vector is recomputed once every question has an answer. */
  async submit(user: User, answers: Record<string, number>): Promise<User> {
    const unknown = Object.keys(answers).filter((k) => !QUESTION_KEYS.has(k));
    if (unknown.length > 0) throw errors.unprocessable('Unknown question keys', { unknown });
    const now = this.ctx.clock.now();
    const entries = Object.entries(answers);
    if (entries.length === 0) throw errors.badRequest('No answers provided');

    return this.ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('personality_answers')
        .values(entries.map(([question_key, value]) => ({ user_id: user.id, question_key, value, answered_at: now })))
        .onConflict((oc) => oc.columns(['user_id', 'question_key']).doUpdateSet((eb) => ({ value: eb.ref('excluded.value'), answered_at: now })))
        .execute();

      const all = await trx.selectFrom('personality_answers').select(['question_key', 'value']).where('user_id', '=', user.id).execute();
      const map = Object.fromEntries(all.map((a) => [a.question_key, a.value]));
      const vector = computePersonalityVector(map);

      const updated = await trx
        .updateTable('users')
        .set({
          personality_vector: vector ? JSON.stringify(vector) : null,
          personality_completed_at: vector ? (user.personality_completed_at ?? now) : null,
          updated_at: now,
        })
        .where('id', '=', user.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return updated;
    });
  }
}

export const personalityRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const service = new PersonalityService(ctx);
  const users = new UserService(ctx);

  app.get('/personality/questions', { schema: { tags: ['personality'], response: { 200: questionsResponse } } }, async () => ({
    scale: { min: LIKERT_MIN, max: LIKERT_MAX, minLabel: 'Not me at all', maxLabel: 'Very much me' },
    questions: QUESTIONS.map((q) => ({ key: q.key, dimension: q.dimension, text: q.text })),
  }));

  app.get(
    '/personality/me',
    { preHandler: [app.authenticate], schema: { tags: ['personality'], response: { 200: personalityProfileDto } } },
    async (req) => service.profile(req.user),
  );

  app.put(
    '/personality/me',
    { preHandler: [app.authenticate], schema: { tags: ['personality'], body: submitAnswersBody, response: { 200: personalityProfileDto } } },
    async (req) => {
      const updated = await service.submit(req.user, req.body.answers);
      const activated = await users.activateIfComplete(updated);
      return service.profile(activated);
    },
  );
};
