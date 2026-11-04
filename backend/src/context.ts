import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { createPostgresDb } from './db/client.js';
import { AuthService } from './auth/service.js';
import { JwtService } from './auth/jwt.js';
import { DevOtpSender, TwilioSmsOtpSender, type OtpSender } from './auth/otp.js';
import type { Logger } from './lib/logger.js';
import { systemClock, type Clock } from './lib/time.js';
import { FakePaymentProvider } from './modules/payments/fake.js';
import type { PaymentProvider } from './modules/payments/provider.js';
import { StripePaymentProvider } from './modules/payments/stripe.js';
import { ApnsPushProvider, LogPushProvider, type PushProvider } from './modules/notifications/push.js';
import { NotificationService } from './modules/notifications/service.js';

export interface AppContext {
  config: Config;
  db: Db;
  clock: Clock;
  log: Logger;
  jwt: JwtService;
  auth: AuthService;
  payments: PaymentProvider;
  push: PushProvider;
  notifications: NotificationService;
}

export interface ContextOverrides {
  db?: Db;
  clock?: Clock;
  log?: Logger;
  payments?: PaymentProvider;
  push?: PushProvider;
  otpSender?: OtpSender;
}

export function createContext(config: Config, log: Logger, overrides: ContextOverrides = {}): AppContext {
  const clock = overrides.clock ?? systemClock;
  const db = overrides.db ?? createPostgresDb(config.DATABASE_URL);
  const jwt = new JwtService(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS, clock);

  const otpSender =
    overrides.otpSender ??
    (config.OTP_PROVIDER === 'twilio'
      ? new TwilioSmsOtpSender(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, config.TWILIO_VERIFY_SERVICE_SID)
      : new DevOtpSender(log));

  const payments =
    overrides.payments ??
    (config.PAYMENT_PROVIDER === 'stripe'
      ? new StripePaymentProvider(config.STRIPE_SECRET_KEY, config.STRIPE_WEBHOOK_SECRET, config.STRIPE_MEMBERSHIP_PRICE_ID)
      : new FakePaymentProvider(clock));

  const push =
    overrides.push ??
    (config.PUSH_PROVIDER === 'apns'
      ? new ApnsPushProvider({
          keyId: config.APNS_KEY_ID,
          teamId: config.APNS_TEAM_ID,
          bundleId: config.APNS_BUNDLE_ID,
          privateKeyPem: config.APNS_PRIVATE_KEY,
          log,
        })
      : new LogPushProvider(log));

  const auth = new AuthService({
    db,
    clock,
    jwt,
    otpSender,
    refreshTokenTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    devOtpCode: config.OTP_PROVIDER === 'dev' ? config.OTP_DEV_CODE : undefined,
  });

  return {
    config,
    db,
    clock,
    log,
    jwt,
    auth,
    payments,
    push,
    notifications: new NotificationService(db, push, clock),
  };
}
