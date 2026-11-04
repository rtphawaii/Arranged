import { loadConfig } from '../config.js';
import { createPostgresDb, migrateDown, migrateToLatest } from './client.js';

const config = loadConfig();
const db = createPostgresDb(config.DATABASE_URL);
const direction = process.argv[2] ?? 'up';

try {
  if (direction === 'down') {
    await migrateDown(db);
    console.log('Rolled back one migration');
  } else {
    await migrateToLatest(db);
    console.log('Database is up to date');
  }
} finally {
  await db.destroy();
}
