import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { City } from '../../db/schema.js';
import { cityDto } from '../dto.js';

export const toCityDto = (c: City): z.infer<typeof cityDto> => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  countryCode: c.country_code,
  timezone: c.timezone,
  currency: c.currency,
  dinnerWeekday: c.dinner_weekday,
  dinnerTime: `${String(c.dinner_hour).padStart(2, '0')}:${String(c.dinner_minute).padStart(2, '0')}`,
  isActive: c.is_active,
});

export const cityRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  app.get('/cities', { schema: { tags: ['cities'], response: { 200: z.array(cityDto) } } }, async () => {
    const rows = await ctx.db.selectFrom('cities').selectAll().where('is_active', '=', true).orderBy('name').execute();
    return rows.map(toCityDto);
  });
};
