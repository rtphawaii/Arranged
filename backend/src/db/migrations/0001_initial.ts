import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('cities')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('slug', 'text', (c) => c.notNull().unique())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('country_code', 'text', (c) => c.notNull())
    .addColumn('timezone', 'text', (c) => c.notNull())
    .addColumn('currency', 'text', (c) => c.notNull().defaultTo('USD'))
    .addColumn('default_price_cents', 'integer', (c) => c.notNull().defaultTo(1500))
    .addColumn('dinner_weekday', 'integer', (c) => c.notNull().defaultTo(3))
    .addColumn('dinner_hour', 'integer', (c) => c.notNull().defaultTo(19))
    .addColumn('dinner_minute', 'integer', (c) => c.notNull().defaultTo(30))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('phone', 'text', (c) => c.notNull().unique())
    .addColumn('email', 'text')
    .addColumn('first_name', 'text')
    .addColumn('last_name', 'text')
    .addColumn('birthdate', 'date')
    .addColumn('gender', 'text')
    .addColumn('city_id', 'uuid', (c) => c.references('cities.id'))
    .addColumn('locale', 'text', (c) => c.notNull().defaultTo('en'))
    .addColumn('languages', 'jsonb', (c) => c.notNull().defaultTo(sql`'["en"]'::jsonb`))
    .addColumn('job_title', 'text')
    .addColumn('bio', 'text')
    .addColumn('photo_url', 'text')
    .addColumn('dietary', 'jsonb', (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('role', 'text', (c) => c.notNull().defaultTo('member'))
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('onboarding'))
    .addColumn('personality_vector', 'jsonb')
    .addColumn('personality_completed_at', 'timestamptz')
    .addColumn('referral_code', 'text', (c) => c.notNull().unique())
    .addColumn('referred_by_user_id', 'uuid', (c) => c.references('users.id'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('personality_answers')
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('question_key', 'text', (c) => c.notNull())
    .addColumn('value', 'integer', (c) => c.notNull())
    .addColumn('answered_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('personality_answers_pk', ['user_id', 'question_key'])
    .execute();

  await db.schema
    .createTable('otp_codes')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('phone', 'text', (c) => c.notNull())
    .addColumn('code_hash', 'text', (c) => c.notNull())
    .addColumn('expires_at', 'timestamptz', (c) => c.notNull())
    .addColumn('attempts', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('consumed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('otp_codes_phone_idx').on('otp_codes').columns(['phone', 'created_at']).execute();

  await db.schema
    .createTable('refresh_tokens')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('expires_at', 'timestamptz', (c) => c.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('restaurants')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('city_id', 'uuid', (c) => c.notNull().references('cities.id'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('address', 'text', (c) => c.notNull())
    .addColumn('neighborhood', 'text')
    .addColumn('latitude', 'double precision')
    .addColumn('longitude', 'double precision')
    .addColumn('cuisine', 'text')
    .addColumn('price_level', 'integer', (c) => c.notNull().defaultTo(2))
    .addColumn('max_tables', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('booking_notes', 'text')
    .addColumn('phone', 'text')
    .addColumn('website_url', 'text')
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('dinner_events')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('city_id', 'uuid', (c) => c.notNull().references('cities.id'))
    .addColumn('starts_at', 'timestamptz', (c) => c.notNull())
    .addColumn('booking_opens_at', 'timestamptz', (c) => c.notNull())
    .addColumn('booking_closes_at', 'timestamptz', (c) => c.notNull())
    .addColumn('reveal_at', 'timestamptz', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('scheduled'))
    .addColumn('price_cents', 'integer', (c) => c.notNull())
    .addColumn('currency', 'text', (c) => c.notNull())
    .addColumn('capacity', 'integer')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('dinner_events_city_start_idx').on('dinner_events').columns(['city_id', 'starts_at']).execute();

  await db.schema
    .createTable('payments')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('booking_id', 'uuid')
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('provider', 'text', (c) => c.notNull())
    .addColumn('provider_ref', 'text')
    .addColumn('client_secret', 'text')
    .addColumn('amount_cents', 'integer', (c) => c.notNull())
    .addColumn('currency', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('failure_reason', 'text')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('payments_provider_ref_idx').on('payments').column('provider_ref').execute();

  await db.schema
    .createTable('bookings')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('event_id', 'uuid', (c) => c.notNull().references('dinner_events.id'))
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('preferences', 'jsonb', (c) => c.notNull())
    .addColumn('payment_id', 'uuid', (c) => c.references('payments.id'))
    .addColumn('cancelled_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  // One live booking per user per event.
  await db.schema
    .createIndex('bookings_user_event_live_idx')
    .on('bookings')
    .columns(['user_id', 'event_id'])
    .unique()
    .where(sql<boolean>`status in ('pending_payment', 'confirmed', 'waitlisted')`)
    .execute();
  await db.schema.createIndex('bookings_event_idx').on('bookings').column('event_id').execute();

  await db.schema
    .createTable('subscriptions')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('provider', 'text', (c) => c.notNull())
    .addColumn('provider_ref', 'text')
    .addColumn('plan', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('current_period_end', 'timestamptz', (c) => c.notNull())
    .addColumn('cancel_at_period_end', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('after_party_venues')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('event_id', 'uuid', (c) => c.notNull().references('dinner_events.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('address', 'text', (c) => c.notNull())
    .addColumn('starts_at', 'timestamptz', (c) => c.notNull())
    .addColumn('notes', 'text')
    .execute();

  await db.schema
    .createTable('dinner_groups')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('event_id', 'uuid', (c) => c.notNull().references('dinner_events.id'))
    .addColumn('restaurant_id', 'uuid', (c) => c.references('restaurants.id'))
    .addColumn('table_label', 'text', (c) => c.notNull())
    .addColumn('reservation_name', 'text')
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('draft'))
    .addColumn('match_score', 'double precision')
    .addColumn('after_party_venue_id', 'uuid', (c) => c.references('after_party_venues.id'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('dinner_groups_event_idx').on('dinner_groups').column('event_id').execute();

  await db.schema
    .createTable('group_members')
    .addColumn('group_id', 'uuid', (c) => c.notNull().references('dinner_groups.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('booking_id', 'uuid', (c) => c.notNull().references('bookings.id'))
    .addColumn('seat_no', 'integer', (c) => c.notNull())
    .addColumn('checked_in_at', 'timestamptz')
    .addPrimaryKeyConstraint('group_members_pk', ['group_id', 'user_id'])
    .execute();
  await db.schema.createIndex('group_members_user_idx').on('group_members').column('user_id').execute();

  await db.schema
    .createTable('icebreakers')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('locale', 'text', (c) => c.notNull().defaultTo('en'))
    .addColumn('category', 'text', (c) => c.notNull())
    .addColumn('text', 'text', (c) => c.notNull())
    .addColumn('intensity', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .execute();

  await db.schema
    .createTable('feedback')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('group_id', 'uuid', (c) => c.notNull().references('dinner_groups.id'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('rating', 'integer', (c) => c.notNull())
    .addColumn('restaurant_rating', 'integer')
    .addColumn('comment', 'text')
    .addColumn('attended', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('feedback_group_user_unique', ['group_id', 'user_id'])
    .execute();

  await db.schema
    .createTable('conversations')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('group_id', 'uuid', (c) => c.references('dinner_groups.id'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('conversation_members')
    .addColumn('conversation_id', 'uuid', (c) => c.notNull().references('conversations.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('last_read_at', 'timestamptz')
    .addColumn('joined_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('conversation_members_pk', ['conversation_id', 'user_id'])
    .execute();

  await db.schema
    .createTable('messages')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('conversation_id', 'uuid', (c) => c.notNull().references('conversations.id').onDelete('cascade'))
    .addColumn('sender_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('body', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('messages_conversation_idx').on('messages').columns(['conversation_id', 'created_at']).execute();

  await db.schema
    .createTable('connection_requests')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('group_id', 'uuid', (c) => c.notNull().references('dinner_groups.id'))
    .addColumn('from_user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('to_user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('connection_requests_unique', ['group_id', 'from_user_id', 'to_user_id'])
    .execute();

  await db.schema
    .createTable('connections')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('user_a_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('user_b_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('group_id', 'uuid', (c) => c.notNull().references('dinner_groups.id'))
    .addColumn('conversation_id', 'uuid', (c) => c.notNull().references('conversations.id'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('connections_pair_unique', ['user_a_id', 'user_b_id'])
    .execute();

  await db.schema
    .createTable('device_tokens')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('platform', 'text', (c) => c.notNull())
    .addColumn('token', 'text', (c) => c.notNull().unique())
    .addColumn('environment', 'text', (c) => c.notNull().defaultTo('production'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('last_seen_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('notifications')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('body', 'text', (c) => c.notNull())
    .addColumn('data', 'jsonb', (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('sent_at', 'timestamptz')
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('notifications_user_idx').on('notifications').columns(['user_id', 'created_at']).execute();

  await db.schema
    .createTable('user_blocks')
    .addColumn('blocker_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('blocked_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('reason', 'text')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('user_blocks_pk', ['blocker_id', 'blocked_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  const tables = [
    'user_blocks',
    'notifications',
    'device_tokens',
    'connections',
    'connection_requests',
    'messages',
    'conversation_members',
    'conversations',
    'feedback',
    'icebreakers',
    'group_members',
    'dinner_groups',
    'after_party_venues',
    'subscriptions',
    'bookings',
    'payments',
    'dinner_events',
    'restaurants',
    'refresh_tokens',
    'otp_codes',
    'personality_answers',
    'users',
    'cities',
  ];
  for (const t of tables) await db.schema.dropTable(t).ifExists().execute();
}
