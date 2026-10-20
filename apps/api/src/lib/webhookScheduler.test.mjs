import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const scheduler = require('./webhookScheduler');
afterEach(() => { scheduler.stop(); scheduler.__setSchedulerDeps(); vi.useRealTimers(); });
describe('automatic webhook processing', () => {
  it('fans out events and delivers them on startup and on subsequent ticks', async () => {
    vi.useFakeTimers();
    const events = vi.fn().mockResolvedValue({ processed: 0 });
    const dispatch = vi.fn().mockResolvedValue({ processed: 0 });
    scheduler.__setSchedulerDeps({ processDomainEventsBatch: events, dispatchWebhookOutboxBatch: dispatch });
    scheduler.start({ intervalMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(events).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
