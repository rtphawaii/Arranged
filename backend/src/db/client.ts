import { Kysely, Migrator, PostgresDialect, type Dialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';
import { StaticMigrationProvider } from './migrations/index.js';

export type Db = Kysely<Database>;

export function createPostgresDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // Keep DATE columns as plain YYYY-MM-DD strings rather than JS Dates.
  pg.types.setTypeParser(1082, (v) => v);
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export function createDbFromDialect(dialect: Dialect): Db {
  return new Kysely<Database>({ dialect });
}

export async function migrateToLatest(db: Db): Promise<void> {
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === 'Error') throw new Error(`Migration ${r.migrationName} failed`);
  }
  if (error) throw error;
}

export async function migrateDown(db: Db): Promise<void> {
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
  const { error } = await migrator.migrateDown();
  if (error) throw error;
}
