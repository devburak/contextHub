import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mongoose } = require('@contexthub/common');
const { dispatchWebhookOutboxBatch, __setDispatcherDeps, parseRetryAfter, calculateBackoff } = require('./webhookDispatcher');
const { encryptCredentials } = require('../services/webhookDelivery');
let originalDb, outbox, webhooks, job, hook, fetch, health;
beforeEach(() => {
  originalDb = mongoose.connection.db;
  job = { _id: 'job', tenantId: 'tenant', webhookId: 'hook', eventId: 'evt', type: 'content.updated', status: 'pending', updatedAt: null,
    payload: { id: 'evt', tenantId: 'tenant', type: 'content.updated' } };
  hook = { _id: 'hook', tenantId: 'tenant', url: 'https://example.com/hook', secret: 'secret', isActive: true };
  const cursor = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn(async () => [job]) };
  outbox = { find: vi.fn(() => cursor), updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }), updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }) };
  webhooks = { findOne: vi.fn(async () => hook) };
  mongoose.connection.db = { collection: (name) => name === 'WebhookOutbox' ? outbox : webhooks };
  fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => 'ok' });
  health = vi.fn().mockResolvedValue();
  __setDispatcherDeps({ canDeliverWebhook: vi.fn().mockResolvedValue(true), fetch, prepareSafeWebhookRequest: async (url) => ({ url }), recordWebhookHealth: health, notifyDisabledWebhooks: vi.fn() });
});
afterEach(() => { mongoose.connection.db = originalDb; __setDispatcherDeps(); vi.unstubAllEnvs(); });
function completed() { return outbox.updateOne.mock.calls.at(-1); }
describe('outbox reliability', () => {
  it.each(['foreign', null, undefined])('quarantines a mismatched event tenant (%s) before any network request', async (tenantId) => {
    job.payload.tenantId = tenantId;
    expect(await dispatchWebhookOutboxBatch()).toMatchObject({ dead: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(completed()[1].$set).toMatchObject({ status: 'dead', errorType: 'permanent', nextRetryAt: null });
  });
  it('stops delivery after recipient access is revoked', async () => {
    __setDispatcherDeps({ fetch, canDeliverWebhook: async () => false, notifyDisabledWebhooks: vi.fn(), recordWebhookHealth: health });
    expect(await dispatchWebhookOutboxBatch()).toMatchObject({ dead: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requeues due retries, pins a tenant-specific lease and records delivery history', async () => {
    expect(await dispatchWebhookOutboxBatch({ tenantId: 'tenant' })).toMatchObject({ succeeded: 1 });
    expect(outbox.updateMany.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant', status: 'failed' });
    expect(webhooks.findOne).toHaveBeenCalledWith({ _id: 'hook', tenantId: 'tenant' });
    const [filter, update] = completed();
    expect(filter).toMatchObject({ tenantId: 'tenant', leaseToken: expect.any(String), status: 'processing' });
    expect(update.$set).toMatchObject({ status: 'done', lastHttpStatus: 200 });
    expect(update.$push.attempts.$each[0]).toMatchObject({ requestBody: expect.stringContaining('evt'), responseBody: 'ok' });
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { 'X-CTXHUB-TIMESTAMP': expect.any(String) } });
  });
  it('reclaims abandoned processing jobs using compare-and-swap and a fresh lease', async () => {
    job.status = 'processing'; job.updatedAt = new Date(0);
    await dispatchWebhookOutboxBatch();
    expect(outbox.find.mock.calls[0][0].$or).toContainEqual({ status: 'processing', updatedAt: { $lt: expect.any(Date) } });
    expect(outbox.updateOne.mock.calls[0][0]).toMatchObject({ status: 'processing', updatedAt: new Date(0) });
  });
  it('does not send when another worker owns the job', async () => {
    outbox.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    expect(await dispatchWebhookOutboxBatch()).toMatchObject({ skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('honors Retry-After and ends retries for permanent errors', async () => {
    fetch.mockResolvedValueOnce({ status: 429, ok: false, text: async () => 'rate limited', headers: { get: () => '600' } });
    const before = Date.now();
    expect(await dispatchWebhookOutboxBatch()).toMatchObject({ failed: 1 });
    expect(completed()[1].$set.nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + 600000);
    fetch.mockResolvedValueOnce({ status: 401, ok: false, text: async () => 'unauthorized' });
    expect(await dispatchWebhookOutboxBatch()).toMatchObject({ dead: 1 });
    expect(completed()[1].$set).toMatchObject({ status: 'dead', errorType: 'permanent', nextRetryAt: null });
  });
  it('hides credentials echoed by a provider and handles Telegram logical errors', async () => {
    vi.stubEnv('WEBHOOK_CREDENTIALS_KEY', Buffer.alloc(32).toString('base64'));
    hook.provider = 'telegram'; hook.configEncrypted = encryptCredentials({ botToken: '123:private', chatId: '1234' }, 'tenant');
    fetch.mockResolvedValue({ status: 200, ok: true, text: async () => JSON.stringify({ ok: false, error_code: 429, description: '123:private', parameters: { retry_after: 600 } }) });
    expect(await dispatchWebhookOutboxBatch()).toMatchObject({ failed: 1 });
    expect(JSON.stringify(completed())).not.toContain('123:private');
    expect(completed()[1].$set.lastHttpStatus).toBe(429);
    expect(health).toHaveBeenCalledWith(webhooks, hook, false, 10);
  });
  it('bounds backoff and supports date-form Retry-After', () => {
    expect(calculateBackoff(30, 60000, 3600000)).toBeLessThanOrEqual(3600000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60000);
    expect(parseRetryAfter('garbage')).toBe(0);
  });
});
