import type { AppContext } from '../context.js';
import { Jobs } from './tasks.js';

/** Simple in-process scheduler; replace with an external cron/queue when running multiple instances. */
export function startScheduler(ctx: AppContext, intervalSeconds: number): () => void {
  const jobs = new Jobs(ctx);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await jobs.runAll();
      ctx.log.debug(result, 'scheduler tick');
    } catch (err) {
      ctx.log.error({ err }, 'scheduler tick failed');
    } finally {
      running = false;
    }
  };
  void tick();
  const handle = setInterval(tick, intervalSeconds * 1000);
  return () => clearInterval(handle);
}
