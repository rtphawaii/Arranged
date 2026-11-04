/** Writes the OpenAPI document to ../docs/openapi.json without needing a database. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createContext } from './context.js';
import { buildApp } from './app.js';
import { silentLogger } from './lib/logger.js';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './db/schema.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'development' });
// A pool that is never connected: route registration doesn't touch the database.
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: config.DATABASE_URL }) }) });
const ctx = createContext(config, silentLogger, { db });
const app = await buildApp(ctx);
await app.ready();
const spec = app.swagger();
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(spec, null, 2));
console.log(`Wrote ${out}`);
await app.close();
await db.destroy();
