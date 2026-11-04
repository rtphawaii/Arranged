import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null, Date | string | null>;
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json<T> = ColumnType<T, T | string, T | string>;

export type UserRole = 'member' | 'admin';
export type UserStatus = 'onboarding' | 'active' | 'suspended' | 'deleted';
export type Gender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';

export interface UsersTable {
  id: string;
  phone: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  birthdate: string | null; // YYYY-MM-DD
  gender: Gender | null;
  city_id: string | null;
  locale: string;
  languages: Json<string[]>;
  job_title: string | null;
  bio: string | null;
  photo_url: string | null;
  dietary: Json<string[]>;
  role: UserRole;
  status: UserStatus;
  personality_vector: Json<number[] | null>;
  personality_completed_at: NullableTimestamp;
  referral_code: string;
  referred_by_user_id: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PersonalityAnswersTable {
  user_id: string;
  question_key: string;
  value: number;
  answered_at: GeneratedTimestamp;
}

export interface OtpCodesTable {
  id: Generated<number>;
  phone: string;
  code_hash: string;
  expires_at: Timestamp;
  attempts: number;
  consumed_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
}

export interface RefreshTokensTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
}

export interface CitiesTable {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  timezone: string;
  currency: string;
  default_price_cents: number;
  /** 0 = Sunday ... 6 = Saturday */
  dinner_weekday: number;
  dinner_hour: number;
  dinner_minute: number;
  is_active: boolean;
  created_at: GeneratedTimestamp;
}

export interface RestaurantsTable {
  id: string;
  city_id: string;
  name: string;
  address: string;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  cuisine: string | null;
  price_level: number; // 1..4
  max_tables: number;
  booking_notes: string | null;
  phone: string | null;
  website_url: string | null;
  is_active: boolean;
  created_at: GeneratedTimestamp;
}

export type EventStatus =
  | 'scheduled'
  | 'booking_open'
  | 'booking_closed'
  | 'matched'
  | 'revealed'
  | 'completed'
  | 'cancelled';

export interface DinnerEventsTable {
  id: string;
  city_id: string;
  starts_at: Timestamp;
  booking_opens_at: Timestamp;
  booking_closes_at: Timestamp;
  reveal_at: Timestamp;
  status: EventStatus;
  price_cents: number;
  currency: string;
  capacity: number | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'waitlisted'
  | 'cancelled'
  | 'refunded'
  | 'attended'
  | 'no_show';

export interface BookingPreferences {
  budget: 'low' | 'mid' | 'high' | 'any';
  dietary: string[];
  languages: string[];
  sameAgeGroup: boolean;
}

export interface BookingsTable {
  id: string;
  user_id: string;
  event_id: string;
  status: BookingStatus;
  preferences: Json<BookingPreferences>;
  payment_id: string | null;
  cancelled_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export type PaymentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
export type PaymentKind = 'seat' | 'membership';

export interface PaymentsTable {
  id: string;
  user_id: string;
  booking_id: string | null;
  kind: PaymentKind;
  provider: string;
  provider_ref: string | null;
  client_secret: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  failure_reason: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired';

export interface SubscriptionsTable {
  id: string;
  user_id: string;
  provider: string;
  provider_ref: string | null;
  plan: string;
  status: SubscriptionStatus;
  current_period_end: Timestamp;
  cancel_at_period_end: boolean;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export type GroupStatus = 'draft' | 'reserved' | 'revealed' | 'completed' | 'cancelled';

export interface DinnerGroupsTable {
  id: string;
  event_id: string;
  restaurant_id: string | null;
  table_label: string;
  reservation_name: string | null;
  status: GroupStatus;
  match_score: number | null;
  after_party_venue_id: string | null;
  created_at: GeneratedTimestamp;
}

export interface GroupMembersTable {
  group_id: string;
  user_id: string;
  booking_id: string;
  seat_no: number;
  checked_in_at: NullableTimestamp;
}

export interface AfterPartyVenuesTable {
  id: string;
  event_id: string;
  name: string;
  address: string;
  starts_at: Timestamp;
  notes: string | null;
}

export interface IcebreakersTable {
  id: Generated<number>;
  locale: string;
  category: string;
  text: string;
  intensity: number; // 1 light .. 3 deep
  is_active: boolean;
}

export interface FeedbackTable {
  id: string;
  group_id: string;
  user_id: string;
  rating: number; // 1..5
  restaurant_rating: number | null;
  comment: string | null;
  attended: boolean;
  created_at: GeneratedTimestamp;
}

export interface ConnectionRequestsTable {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: GeneratedTimestamp;
}

export interface ConnectionsTable {
  id: string;
  user_a_id: string;
  user_b_id: string;
  group_id: string;
  conversation_id: string;
  created_at: GeneratedTimestamp;
}

export type ConversationKind = 'direct' | 'group';

export interface ConversationsTable {
  id: string;
  kind: ConversationKind;
  group_id: string | null;
  created_at: GeneratedTimestamp;
}

export interface ConversationMembersTable {
  conversation_id: string;
  user_id: string;
  last_read_at: NullableTimestamp;
  joined_at: GeneratedTimestamp;
}

export interface MessagesTable {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: GeneratedTimestamp;
}

export interface DeviceTokensTable {
  id: string;
  user_id: string;
  platform: 'ios' | 'android';
  token: string;
  environment: 'sandbox' | 'production';
  created_at: GeneratedTimestamp;
  last_seen_at: GeneratedTimestamp;
}

export interface NotificationsTable {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Json<Record<string, unknown>>;
  sent_at: NullableTimestamp;
  read_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
}

export interface UserBlocksTable {
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: GeneratedTimestamp;
}

export interface Database {
  users: UsersTable;
  personality_answers: PersonalityAnswersTable;
  otp_codes: OtpCodesTable;
  refresh_tokens: RefreshTokensTable;
  cities: CitiesTable;
  restaurants: RestaurantsTable;
  dinner_events: DinnerEventsTable;
  bookings: BookingsTable;
  payments: PaymentsTable;
  subscriptions: SubscriptionsTable;
  dinner_groups: DinnerGroupsTable;
  group_members: GroupMembersTable;
  after_party_venues: AfterPartyVenuesTable;
  icebreakers: IcebreakersTable;
  feedback: FeedbackTable;
  connection_requests: ConnectionRequestsTable;
  connections: ConnectionsTable;
  conversations: ConversationsTable;
  conversation_members: ConversationMembersTable;
  messages: MessagesTable;
  device_tokens: DeviceTokensTable;
  notifications: NotificationsTable;
  user_blocks: UserBlocksTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type City = Selectable<CitiesTable>;
export type Restaurant = Selectable<RestaurantsTable>;
export type DinnerEvent = Selectable<DinnerEventsTable>;
export type Booking = Selectable<BookingsTable>;
export type Payment = Selectable<PaymentsTable>;
export type Subscription = Selectable<SubscriptionsTable>;
export type DinnerGroup = Selectable<DinnerGroupsTable>;
export type GroupMember = Selectable<GroupMembersTable>;
export type AfterPartyVenue = Selectable<AfterPartyVenuesTable>;
export type Icebreaker = Selectable<IcebreakersTable>;
export type Feedback = Selectable<FeedbackTable>;
export type Connection = Selectable<ConnectionsTable>;
export type Conversation = Selectable<ConversationsTable>;
export type Message = Selectable<MessagesTable>;
export type DeviceToken = Selectable<DeviceTokensTable>;
export type Notification = Selectable<NotificationsTable>;
