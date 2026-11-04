import { z } from 'zod';

const bool = z.preprocess(
  (v) => (typeof v === 'string' ? ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()) : v),
  z.boolean(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_ENABLED: bool.default(true),

  DATABASE_URL: z.string().default('postgres://arranged:arranged@localhost:5432/arranged'),

  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me-please-1234'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(60),

  OTP_PROVIDER: z.enum(['dev', 'twilio']).default('dev'),
  OTP_DEV_CODE: z.string().regex(/^\d{6}$/).default('000000'),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_VERIFY_SERVICE_SID: z.string().default(''),

  PAYMENT_PROVIDER: z.enum(['fake', 'stripe']).default('fake'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_MEMBERSHIP_PRICE_ID: z.string().default(''),

  PUSH_PROVIDER: z.enum(['log', 'apns']).default('log'),
  APNS_KEY_ID: z.string().default(''),
  APNS_TEAM_ID: z.string().default(''),
  APNS_BUNDLE_ID: z.string().default('com.arranged.app'),
  APNS_PRIVATE_KEY: z.string().default(''),
  APNS_USE_SANDBOX: bool.default(true),

  ADMIN_API_TOKEN: z.string().default('dev-admin-token'),

  SCHEDULER_ENABLED: bool.default(true),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET.startsWith('dev-only')) throw new Error('JWT_SECRET must be set in production');
    if (config.ADMIN_API_TOKEN === 'dev-admin-token') throw new Error('ADMIN_API_TOKEN must be set in production');
  }
  return config;
}
