import { loadConfig } from '../config.js';
import { createContext } from '../context.js';
import { Jobs } from './tasks.js';

const config = loadConfig();
const log = console as unknown as import('../lib/logger.js').Logger;
const ctx = createContext(config, log);
const jobs = new Jobs(ctx);
const task = process.argv[2] ?? 'all';

try {
  switch (task) {
    case 'tick':
      console.log(await jobs.lifecycleTick());
      break;
    case 'events':
      console.log(`created ${await jobs.ensureUpcomingEvents()} events`);
      break;
    case 'reminders':
      console.log(`sent ${await jobs.sendReminders()} reminders`);
      break;
    case 'cleanup':
      await jobs.cleanup();
      break;
    case 'all':
      console.log(await jobs.runAll());
      break;
    default:
      console.error(`Unknown task "${task}". Use: tick | events | reminders | cleanup | all`);
      process.exitCode = 1;
  }
} finally {
  await ctx.db.destroy();
}
