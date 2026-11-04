/**
 * Zod schemas for API request/response bodies. These drive validation, serialisation and the
 * generated OpenAPI document (`npm run openapi`), which the iOS client models mirror.
 */
import { z } from 'zod';

export const isoDate = z.string().datetime({ offset: true });

export const genderSchema = z.enum(['woman', 'man', 'non_binary', 'prefer_not_to_say']);
export const budgetSchema = z.enum(['low', 'mid', 'high', 'any']);

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const okResponse = z.object({ ok: z.literal(true) });

// --- Auth ---
export const requestOtpBody = z.object({ phone: z.string().min(7).max(20) });
export const requestOtpResponse = z.object({ phone: z.string(), expiresInSeconds: z.number() });
export const verifyOtpBody = z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) });
export const tokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export const refreshBody = z.object({ refreshToken: z.string() });

// --- Users ---
export const userDto = z.object({
  id: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  birthdate: z.string().nullable(),
  gender: genderSchema.nullable(),
  cityId: z.string().nullable(),
  locale: z.string(),
  languages: z.array(z.string()),
  jobTitle: z.string().nullable(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  dietary: z.array(z.string()),
  role: z.enum(['member', 'admin']),
  status: z.enum(['onboarding', 'active', 'suspended', 'deleted']),
  personalityCompleted: z.boolean(),
  personalityLabels: z.array(z.string()),
  referralCode: z.string(),
  hasActiveMembership: z.boolean(),
  createdAt: isoDate,
});
export const verifyOtpResponse = z.object({ user: userDto, isNewUser: z.boolean(), tokens: tokensSchema });

export const updateProfileBody = z
  .object({
    firstName: z.string().min(1).max(60),
    lastName: z.string().min(1).max(60),
    email: z.string().email().nullable(),
    birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gender: genderSchema,
    cityId: z.string().uuid(),
    locale: z.string().min(2).max(10),
    languages: z.array(z.string().min(2).max(10)).min(1).max(5),
    jobTitle: z.string().max(80).nullable(),
    bio: z.string().max(500).nullable(),
    photoUrl: z.string().url().nullable(),
    dietary: z.array(z.string().max(30)).max(10),
    referralCode: z.string().max(12).optional(),
  })
  .partial();

export const registerDeviceBody = z.object({
  token: z.string().min(10),
  platform: z.enum(['ios', 'android']).default('ios'),
  environment: z.enum(['sandbox', 'production']).default('production'),
});

// --- Personality ---
export const questionDto = z.object({ key: z.string(), dimension: z.string(), text: z.string() });
export const questionsResponse = z.object({
  scale: z.object({ min: z.number(), max: z.number(), minLabel: z.string(), maxLabel: z.string() }),
  questions: z.array(questionDto),
});
export const submitAnswersBody = z.object({ answers: z.record(z.string(), z.number().int().min(1).max(5)) });
export const personalityProfileDto = z.object({
  completed: z.boolean(),
  answered: z.number(),
  total: z.number(),
  vector: z.array(z.number()).nullable(),
  dimensions: z.array(z.string()),
  labels: z.array(z.string()),
});

// --- Cities / restaurants ---
export const cityDto = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  countryCode: z.string(),
  timezone: z.string(),
  currency: z.string(),
  dinnerWeekday: z.number(),
  dinnerTime: z.string(),
  isActive: z.boolean(),
});

export const restaurantDto = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  neighborhood: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  cuisine: z.string().nullable(),
  priceLevel: z.number(),
  phone: z.string().nullable(),
  websiteUrl: z.string().nullable(),
});

// --- Events / bookings ---
export const eventStatusSchema = z.enum([
  'scheduled',
  'booking_open',
  'booking_closed',
  'matched',
  'revealed',
  'completed',
  'cancelled',
]);
export const bookingStatusSchema = z.enum([
  'pending_payment',
  'confirmed',
  'waitlisted',
  'cancelled',
  'refunded',
  'attended',
  'no_show',
]);

export const bookingPreferencesSchema = z.object({
  budget: budgetSchema.default('any'),
  dietary: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  sameAgeGroup: z.boolean().default(false),
});

export const paymentDto = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.enum(['requires_payment', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled']),
  amountCents: z.number(),
  currency: z.string(),
  clientSecret: z.string().nullable(),
});

export const bookingDto = z.object({
  id: z.string(),
  eventId: z.string(),
  status: bookingStatusSchema,
  preferences: bookingPreferencesSchema,
  payment: paymentDto.nullable(),
  groupId: z.string().nullable(),
  createdAt: isoDate,
});

export const eventDto = z.object({
  id: z.string(),
  cityId: z.string(),
  startsAt: isoDate,
  bookingOpensAt: isoDate,
  bookingClosesAt: isoDate,
  revealAt: isoDate,
  status: eventStatusSchema,
  priceCents: z.number(),
  currency: z.string(),
  spotsLeft: z.number().nullable(),
  myBooking: bookingDto.nullable(),
});

export const createBookingBody = z.object({
  preferences: bookingPreferencesSchema.default({ budget: 'any', dietary: [], languages: [], sameAgeGroup: false }),
});
export const createBookingResponse = z.object({ booking: bookingDto, requiresPayment: z.boolean() });

// --- Membership ---
export const membershipDto = z.object({
  id: z.string(),
  plan: z.string(),
  status: z.enum(['active', 'past_due', 'cancelled', 'expired']),
  currentPeriodEnd: isoDate,
  cancelAtPeriodEnd: z.boolean(),
  clientSecret: z.string().nullable(),
});

// --- Groups ---
export const tablemateDto = z.object({
  userId: z.string(),
  firstName: z.string(),
  age: z.number().nullable(),
  jobTitle: z.string().nullable(),
  photoUrl: z.string().nullable(),
  languages: z.array(z.string()),
  personalityLabels: z.array(z.string()),
  checkedIn: z.boolean(),
});

export const afterPartyDto = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  startsAt: isoDate,
  notes: z.string().nullable(),
});

export const groupDto = z.object({
  id: z.string(),
  eventId: z.string(),
  startsAt: isoDate,
  revealAt: isoDate,
  status: z.enum(['draft', 'reserved', 'revealed', 'completed', 'cancelled']),
  isRevealed: z.boolean(),
  tableLabel: z.string(),
  reservationName: z.string().nullable(),
  restaurant: restaurantDto.nullable(),
  tablemates: z.array(tablemateDto),
  afterParty: afterPartyDto.nullable(),
  myCheckedInAt: isoDate.nullable(),
  feedbackSubmitted: z.boolean(),
  conversationId: z.string().nullable(),
});

export const icebreakerDto = z.object({ id: z.number(), category: z.string(), text: z.string(), intensity: z.number() });

// --- Feedback / connections ---
export const feedbackBody = z.object({
  rating: z.number().int().min(1).max(5),
  restaurantRating: z.number().int().min(1).max(5).nullable().default(null),
  comment: z.string().max(1000).nullable().default(null),
  attended: z.boolean().default(true),
  /** User ids from the table the member would like to stay in touch with. */
  connectWith: z.array(z.string().uuid()).default([]),
});

export const connectionDto = z.object({
  id: z.string(),
  user: tablemateDto,
  groupId: z.string(),
  conversationId: z.string(),
  createdAt: isoDate,
});

export const connectResponse = z.object({ requested: z.boolean(), matched: z.boolean(), connection: connectionDto.nullable() });

// --- Chat ---
export const messageDto = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  createdAt: isoDate,
});
export const conversationDto = z.object({
  id: z.string(),
  kind: z.enum(['direct', 'group']),
  groupId: z.string().nullable(),
  title: z.string(),
  participants: z.array(z.object({ userId: z.string(), firstName: z.string(), photoUrl: z.string().nullable() })),
  lastMessage: messageDto.nullable(),
  unreadCount: z.number(),
});
export const sendMessageBody = z.object({ body: z.string().min(1).max(2000) });
export const messagesQuery = z.object({
  after: z.string().optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// --- Notifications ---
export const notificationDto = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  readAt: isoDate.nullable(),
  createdAt: isoDate,
});

// --- Admin ---
export const adminCityBody = z.object({
  slug: z.string().min(2).max(40),
  name: z.string().min(2).max(60),
  countryCode: z.string().length(2),
  timezone: z.string(),
  currency: z.string().length(3).default('USD'),
  defaultPriceCents: z.number().int().min(0).default(1500),
  dinnerWeekday: z.number().int().min(0).max(6).default(3),
  dinnerHour: z.number().int().min(0).max(23).default(19),
  dinnerMinute: z.number().int().min(0).max(59).default(30),
  isActive: z.boolean().default(true),
});
export const adminRestaurantBody = z.object({
  cityId: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().min(1),
  neighborhood: z.string().nullable().default(null),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  cuisine: z.string().nullable().default(null),
  priceLevel: z.number().int().min(1).max(4).default(2),
  maxTables: z.number().int().min(1).default(1),
  bookingNotes: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  websiteUrl: z.string().nullable().default(null),
  isActive: z.boolean().default(true),
});
export const adminEventBody = z.object({
  cityId: z.string().uuid(),
  startsAt: isoDate,
  bookingOpensAt: isoDate.optional(),
  bookingClosesAt: isoDate.optional(),
  revealAt: isoDate.optional(),
  priceCents: z.number().int().min(0).optional(),
  capacity: z.number().int().min(4).nullable().optional(),
});
export const adminGenerateEventsBody = z.object({ weeksAhead: z.number().int().min(1).max(12).default(4) });
export const adminGroupUpdateBody = z.object({
  restaurantId: z.string().uuid().nullable().optional(),
  reservationName: z.string().nullable().optional(),
  afterPartyVenueId: z.string().uuid().nullable().optional(),
});
export const adminAfterPartyBody = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  startsAt: isoDate,
  notes: z.string().nullable().default(null),
});
export const adminIcebreakerBody = z.object({
  locale: z.string().default('en'),
  category: z.string().min(1),
  text: z.string().min(1),
  intensity: z.number().int().min(1).max(3).default(1),
});
