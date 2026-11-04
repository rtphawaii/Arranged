import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Subscription, User } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { ageAt, dateOnly } from '../../lib/time.js';
import type { registerDeviceBody, updateProfileBody, userDto } from '../dto.js';
import { describeVector } from '../personality/questions.js';

export type UserDto = z.infer<typeof userDto>;

export const parseJsonArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const parseVector = (v: unknown): number[] | null => {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

export class UserService {
  constructor(private readonly ctx: AppContext) {}

  async activeMembership(userId: string): Promise<Subscription | undefined> {
    return this.ctx.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('status', '=', 'active')
      .where('current_period_end', '>', this.ctx.clock.now())
      .orderBy('current_period_end', 'desc')
      .executeTakeFirst();
  }

  async toDto(user: User): Promise<UserDto> {
    const membership = await this.activeMembership(user.id);
    const vector = parseVector(user.personality_vector);
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      birthdate: dateOnly(user.birthdate),
      gender: user.gender,
      cityId: user.city_id,
      locale: user.locale,
      languages: parseJsonArray(user.languages),
      jobTitle: user.job_title,
      bio: user.bio,
      photoUrl: user.photo_url,
      dietary: parseJsonArray(user.dietary),
      role: user.role,
      status: user.status,
      personalityCompleted: user.personality_completed_at !== null,
      personalityLabels: vector ? describeVector(vector) : [],
      referralCode: user.referral_code,
      hasActiveMembership: membership !== undefined,
      createdAt: user.created_at.toISOString(),
    };
  }

  async updateProfile(user: User, body: z.infer<typeof updateProfileBody>): Promise<User> {
    const now = this.ctx.clock.now();
    if (body.birthdate !== undefined && ageAt(body.birthdate, now) < 18) {
      throw errors.unprocessable('You must be at least 18 to join');
    }
    if (body.cityId !== undefined) {
      const city = await this.ctx.db.selectFrom('cities').select('id').where('id', '=', body.cityId).where('is_active', '=', true).executeTakeFirst();
      if (!city) throw errors.unprocessable('Unknown or inactive city');
    }
    let referredBy: string | null | undefined;
    if (body.referralCode && !user.referred_by_user_id) {
      const referrer = await this.ctx.db
        .selectFrom('users')
        .select('id')
        .where('referral_code', '=', body.referralCode.toUpperCase())
        .where('id', '!=', user.id)
        .executeTakeFirst();
      if (!referrer) throw errors.unprocessable('Invalid referral code');
      referredBy = referrer.id;
    }

    const updated = await this.ctx.db
      .updateTable('users')
      .set({
        ...(body.firstName !== undefined && { first_name: body.firstName.trim() }),
        ...(body.lastName !== undefined && { last_name: body.lastName.trim() }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.birthdate !== undefined && { birthdate: body.birthdate }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.cityId !== undefined && { city_id: body.cityId }),
        ...(body.locale !== undefined && { locale: body.locale }),
        ...(body.languages !== undefined && { languages: JSON.stringify(body.languages) }),
        ...(body.jobTitle !== undefined && { job_title: body.jobTitle }),
        ...(body.bio !== undefined && { bio: body.bio }),
        ...(body.photoUrl !== undefined && { photo_url: body.photoUrl }),
        ...(body.dietary !== undefined && { dietary: JSON.stringify(body.dietary) }),
        ...(referredBy !== undefined && { referred_by_user_id: referredBy }),
        updated_at: now,
      })
      .where('id', '=', user.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.activateIfComplete(updated);
  }

  /** A user leaves `onboarding` once profile basics and the questionnaire are in. */
  async activateIfComplete(user: User): Promise<User> {
    if (user.status !== 'onboarding') return user;
    const complete =
      user.first_name && user.birthdate && user.gender && user.city_id && user.personality_completed_at !== null;
    if (!complete) return user;
    return this.ctx.db
      .updateTable('users')
      .set({ status: 'active', updated_at: this.ctx.clock.now() })
      .where('id', '=', user.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async registerDevice(user: User, body: z.infer<typeof registerDeviceBody>): Promise<void> {
    const now = this.ctx.clock.now();
    await this.ctx.db
      .insertInto('device_tokens')
      .values({
        id: newId(),
        user_id: user.id,
        platform: body.platform,
        token: body.token,
        environment: body.environment,
        created_at: now,
        last_seen_at: now,
      })
      .onConflict((oc) => oc.column('token').doUpdateSet({ user_id: user.id, environment: body.environment, last_seen_at: now }))
      .execute();
  }

  async deleteAccount(user: User): Promise<void> {
    const now = this.ctx.clock.now();
    await this.ctx.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('device_tokens').where('user_id', '=', user.id).execute();
      await trx.updateTable('refresh_tokens').set({ revoked_at: now }).where('user_id', '=', user.id).execute();
      await trx
        .updateTable('bookings')
        .set({ status: 'cancelled', cancelled_at: now, updated_at: now })
        .where('user_id', '=', user.id)
        .where('status', 'in', ['pending_payment', 'confirmed', 'waitlisted'])
        .execute();
      await trx
        .updateTable('users')
        .set({
          status: 'deleted',
          phone: `deleted:${user.id}`,
          email: null,
          first_name: null,
          last_name: null,
          bio: null,
          photo_url: null,
          job_title: null,
          updated_at: now,
        })
        .where('id', '=', user.id)
        .execute();
    });
  }

  async blockUser(user: User, blockedId: string, reason: string | null): Promise<void> {
    if (blockedId === user.id) throw errors.badRequest('Cannot block yourself');
    await this.ctx.db
      .insertInto('user_blocks')
      .values({ blocker_id: user.id, blocked_id: blockedId, reason, created_at: this.ctx.clock.now() })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}
