const { dispatchWebhookOutboxBatch } = require('./webhookDispatcher');

const DEFAULT_INTERVAL_MS = 5000;
let timer = null;
let isRunning = false;

async function runBatch() {
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    const result = await dispatchWebhookOutboxBatch();
    if (result.processed) {
      console.log('[webhookScheduler] dispatched batch', result);
    }
  } catch (error) {
    console.error('[webhookScheduler] dispatch failed', error);
  } finally {
    isRunning = false;
  }
}

function start(options = {}) {
  if (timer) {
    return;
  }
  const envInterval = Number.parseInt(process.env.WEBHOOK_DISPATCH_INTERVAL_MS, 10);
  const supplied = Number.parseInt(options.intervalMs, 10);
  const intervalMs = Number.isFinite(supplied) && supplied > 0
    ? supplied
    : Number.isFinite(envInterval) && envInterval > 0
      ? envInterval
      : DEFAULT_INTERVAL_MS;

  timer = setInterval(runBatch, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  runBatch();
  console.log(`[webhookScheduler] started (interval=${intervalMs}ms)`);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  start,
  stop
};
