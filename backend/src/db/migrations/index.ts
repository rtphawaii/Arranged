import type { Migration, MigrationProvider } from 'kysely';
import * as m0001 from './0001_initial.js';

/**
 * Static migration registry. Add new migrations here in order; the key is the migration name
 * Kysely stores in the `kysely_migration` table, so never rename an entry once it has run anywhere.
 */
const migrations: Record<string, Migration> = {
  '0001_initial': m0001,
};

export class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  }
}
