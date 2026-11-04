import type { Db } from '../db/client.js';
import type { User } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import { newId, randomDigits, randomToken, sha256 } from '../lib/ids.js';
import { normalizePhone } from '../lib/phone.js';
import { addDays, addMinutes, type Clock } from '../lib/time.js';
import { JwtService } from './jwt.js';
import type { OtpSender } from './otp.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthServiceOptions {
  db: Db;
  clock: Clock;
  jwt: JwtService;
  otpSender: OtpSender;
  refreshTokenTtlDays: number;
  /** When set, this code is accepted for any phone (development only). */
  devOtpCode?: string;
  otpTtlMinutes?: number;
  maxOtpAttempts?: number;
}

export class AuthService {
  private readonly otpTtlMinutes: number;
  private readonly maxAttempts: number;

  constructor(private readonly o: AuthServiceOptions) {
    this.otpTtlMinutes = o.otpTtlMinutes ?? 10;
    this.maxAttempts = o.maxOtpAttempts ?? 5;
  }

  async requestOtp(rawPhone: string): Promise<{ phone: string; expiresInSeconds: number }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw errors.badRequest('Phone must be in E.164 format, e.g. +14155551234');

    const now = this.o.clock.now();
    const recent = await this.o.db
      .selectFrom('otp_codes')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('phone', '=', phone)
      .where('created_at', '>', addMinutes(now, -10))
      .executeTakeFirstOrThrow();
    if (Number(recent.count) >= 5) throw errors.tooMany('Too many codes requested. Try again later.');

    const code = randomDigits(6);
    await this.o.db
      .insertInto('otp_codes')
      .values({
        phone,
        code_hash: sha256(`${phone}:${code}`),
        expires_at: addMinutes(now, this.otpTtlMinutes),
        attempts: 0,
        consumed_at: null,
        created_at: now,
      })
      .execute();
    await this.o.otpSender.send(phone, code);
    return { phone, expiresInSeconds: this.otpTtlMinutes * 60 };
  }

  async verifyOtp(rawPhone: string, code: string): Promise<{ user: User; isNewUser: boolean; tokens: AuthTokens }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw errors.badRequest('Invalid phone number');
    const now = this.o.clock.now();

    const otp = await this.o.db
      .selectFrom('otp_codes')
      .selectAll()
      .where('phone', '=', phone)
      .where('consumed_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    const devMatch = this.o.devOtpCode !== undefined && code === this.o.devOtpCode;
    if (!devMatch) {
      if (!otp) throw errors.unauthorized('No active code for this phone. Request a new one.');
      if (otp.expires_at.getTime() < now.getTime()) throw errors.unauthorized('Code expired. Request a new one.');
      if (otp.attempts >= this.maxAttempts) throw errors.tooMany('Too many attempts. Request a new code.');
      if (otp.code_hash !== sha256(`${phone}:${code}`)) {
        await this.o.db
          .updateTable('otp_codes')
          .set({ attempts: otp.attempts + 1 })
          .where('id', '=', otp.id)
          .execute();
        throw errors.unauthorized('Incorrect code');
      }
    }
    if (otp) {
      await this.o.db.updateTable('otp_codes').set({ consumed_at: now }).where('id', '=', otp.id).execute();
    }

    let user = await this.o.db.selectFrom('users').selectAll().where('phone', '=', phone).executeTakeFirst();
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = await this.o.db
        .insertInto('users')
        .values({
          id: newId(),
          phone,
          email: null,
          first_name: null,
          last_name: null,
          birthdate: null,
          gender: null,
          city_id: null,
          locale: 'en',
          languages: JSON.stringify(['en']),
          job_title: null,
          bio: null,
          photo_url: null,
          dietary: JSON.stringify([]),
          role: 'member',
          status: 'onboarding',
          personality_vector: null,
          personality_completed_at: null,
          referral_code: randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 8),
          referred_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    if (user.status === 'suspended') throw errors.forbidden('This account is suspended');
    if (user.status === 'deleted') throw errors.forbidden('This account has been deleted');

    const tokens = await this.issueTokens(user);
    return { user, isNewUser, tokens };
  }

  async issueTokens(user: User): Promise<AuthTokens> {
    const now = this.o.clock.now();
    const refreshToken = randomToken(48);
    await this.o.db
      .insertInto('refresh_tokens')
      .values({
        id: newId(),
        user_id: user.id,
        token_hash: sha256(refreshToken),
        expires_at: addDays(now, this.o.refreshTokenTtlDays),
        revoked_at: null,
        created_at: now,
      })
      .execute();
    const accessToken = await this.o.jwt.sign({ sub: user.id, role: user.role }, now);
    return { accessToken, refreshToken, expiresIn: this.o.jwt.accessTokenTtlSeconds };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = this.o.clock.now();
    const hash = sha256(refreshToken);
    const row = await this.o.db.selectFrom('refresh_tokens').selectAll().where('token_hash', '=', hash).executeTakeFirst();
    if (!row || row.revoked_at || row.expires_at.getTime() < now.getTime()) {
      throw errors.unauthorized('Invalid refresh token');
    }
    const user = await this.o.db.selectFrom('users').selectAll().where('id', '=', row.user_id).executeTakeFirstOrThrow();
    if (user.status === 'suspended' || user.status === 'deleted') throw errors.forbidden('Account unavailable');
    // Rotate: revoke the old token, issue a new pair.
    await this.o.db.updateTable('refresh_tokens').set({ revoked_at: now }).where('id', '=', row.id).execute();
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.o.db
      .updateTable('refresh_tokens')
      .set({ revoked_at: this.o.clock.now() })
      .where('token_hash', '=', sha256(refreshToken))
      .where('revoked_at', 'is', null)
      .execute();
  }

  async revokeAll(userId: string): Promise<void> {
    await this.o.db
      .updateTable('refresh_tokens')
      .set({ revoked_at: this.o.clock.now() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
