import { loadConfig } from './config.js';
import { createContext } from './context.js';
import { buildApp } from './app.js';
import { migrateToLatest } from './db/client.js';
import { startScheduler } from './jobs/scheduler.js';

const config = loadConfig();
const loggerOptions =
  config.NODE_ENV === 'development'
    ? { level: config.LOG_LEVEL, transport: { target: 'pino-pretty', options: { colorize: true } } }
    : { level: config.LOG_LEVEL };

// Bootstrap a temporary Fastify logger so context services share the same pino instance.
const { default: Fastify } = await import('fastify');
const bootstrap = Fastify({ logger: loggerOptions });
const ctx = createContext(config, bootstrap.log);

await migrateToLatest(ctx.db);
const app = await buildApp(ctx, { logger: loggerOptions });

const stopScheduler = config.SCHEDULER_ENABLED ? startScheduler(ctx, config.SCHEDULER_INTERVAL_SECONDS) : () => {};

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  stopScheduler();
  await app.close();
  await ctx.db.destroy();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(`API ready on http://${config.HOST}:${config.PORT} (docs at /docs)`);
