import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mongoose } = require('@contexthub/common');
const { beginSlackConnect, completeSlackConnect, __setSlackOAuthDeps } = require('./webhookSlackOAuth');
let previousDb, records, fetch, createWebhook;
beforeEach(() => {
  previousDb = mongoose.connection.db;
  const store = new Map();
  records = {
    createIndex: vi.fn(), insertOne: vi.fn(async (doc) => store.set(doc._id, doc)),
    findOneAndDelete: vi.fn(async (query) => {
      const doc = store.get(query._id);
      if (!doc || doc.tenantId !== query.tenantId || doc.userId !== query.userId || doc.expiresAt <= query.expiresAt.$gt) return { value: null };
      store.delete(query._id); return { value: doc };
    })
  };
  mongoose.connection.db = { collection: () => records };
  vi.stubEnv('SLACK_CLIENT_ID', 'client'); vi.stubEnv('SLACK_CLIENT_SECRET', 'private');
  vi.stubEnv('SLACK_REDIRECT_URI', 'https://admin.example.com/varliklar/webhooks');
  vi.stubEnv('WEBHOOK_CREDENTIALS_KEY', Buffer.alloc(32).toString('base64'));
  fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ok: true, incoming_webhook: { url: 'https://hooks.slack.com/services/T/B/secret', channel: '#ops' } }) });
  createWebhook = vi.fn().mockResolvedValue({ webhook: { id: 'hook' } });
  __setSlackOAuthDeps({ fetch, createWebhook });
});
afterEach(() => { mongoose.connection.db = previousDb; __setSlackOAuthDeps(); vi.unstubAllEnvs(); });
async function start() {
  const { authorizeUrl } = await beginSlackConnect('tenant-a', 'user-a', { events: ['content.published'] });
  return new URL(authorizeUrl).searchParams.get('state');
}
describe('Slack OAuth state', () => {
  it('requests only incoming-webhook and stores only a hash of the state', async () => {
    const state = await start();
    expect(records.insertOne.mock.calls[0][0]._id).not.toBe(state);
    expect(records.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  });
  it('binds a one-use state to both tenant and authenticated user', async () => {
    const state = await start();
    await expect(completeSlackConnect('tenant-b', 'user-a', { state, code: 'code' })).rejects.toThrow('expired');
    await expect(completeSlackConnect('tenant-a', 'user-b', { state, code: 'code' })).rejects.toThrow('expired');
    expect(fetch).not.toHaveBeenCalled();
    await completeSlackConnect('tenant-a', 'user-a', { state, code: 'code' });
    expect(createWebhook).toHaveBeenCalledWith('tenant-a', expect.objectContaining({ provider: 'slack', events: ['content.published'] }), { slackOAuth: true });
    await expect(completeSlackConnect('tenant-a', 'user-a', { state, code: 'code' })).rejects.toThrow('expired');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('rejects expired state before making an external request', async () => {
    const state = await start();
    records.insertOne.mock.calls[0][0].expiresAt = new Date(0);
    await expect(completeSlackConnect('tenant-a', 'user-a', { state, code: 'code' })).rejects.toThrow('expired');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not create a connection after Slack rejects the authorization code', async () => {
    const state = await start();
    fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ok: false, error: 'invalid_code' }) });
    await expect(completeSlackConnect('tenant-a', 'user-a', { state, code: 'code' })).rejects.toThrow('authorization failed');
    expect(createWebhook).not.toHaveBeenCalled();
  });
});
