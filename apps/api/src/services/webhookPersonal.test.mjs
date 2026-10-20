import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Webhook, mongoose } = require('@contexthub/common');
const service = require('./webhookService');
let previousDb, outbox, ownId, otherId;
beforeEach(() => {
  previousDb = mongoose.connection.db;
  ownId = new mongoose.Types.ObjectId(); otherId = new mongoose.Types.ObjectId();
  outbox = { find: vi.fn(() => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) })),
    findOne: vi.fn(), updateOne: vi.fn(), updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }), deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }) };
  mongoose.connection.db = { collection: () => outbox };
  vi.spyOn(Webhook, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ _id: ownId }] }), sort: () => ({ lean: async () => [] }) });
});
afterEach(() => { mongoose.connection.db = previousDb; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('personal webhook management boundaries', () => {
  it('assigns ownership from authentication instead of submitted data', async () => {
    vi.stubEnv('WEBHOOK_CREDENTIALS_KEY', Buffer.alloc(32).toString('base64'));
    let saved;
    vi.spyOn(Webhook.prototype, 'save').mockImplementation(async function () { saved = this.toObject(); });
    const result = await service.createWebhook('tenant-a', { provider: 'telegram', scope: 'personal', ownerUserId: 'attacker', integration: { botToken: '123:token', chatId: '321' } }, { actorId: 'user-a' });
    expect(saved).toMatchObject({ tenantId: 'tenant-a', scope: 'personal', ownerUserId: 'user-a', integration: { chatId: '321' } });
    expect(saved.configEncrypted).not.toContain('123:token');
    expect(result.webhook.scope).toBe('personal');
    expect(result.webhook).not.toHaveProperty('ownerUserId');
  });
  it('does not allow anonymous ownership or full-content personal webhooks', async () => {
    await expect(service.createWebhook('tenant-a', { provider: 'telegram', scope: 'personal' })).rejects.toThrow('authenticated user');
    await expect(service.createWebhook('tenant-a', { provider: 'webhook', scope: 'personal' }, { actorId: 'user-a' })).rejects.toThrow('chat provider');
  });
  it('limits lists and delivery history to shared or own connections', async () => {
    await service.listWebhooks('tenant-a', 'user-a');
    expect(Webhook.find.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', $or: [{ scope: { $ne: 'personal' } }, { scope: 'personal', ownerUserId: 'user-a' }] });
    await service.getDeliveries('tenant-a', { actorId: 'user-a', webhookId: String(otherId) });
    expect(outbox.find).toHaveBeenCalledWith({ tenantId: 'tenant-a', webhookId: { $in: [] } });
  });
  it('limits bulk retry and delete to visible subscriptions', async () => {
    await service.bulkRetryAllFailed('tenant-a', 'user-a');
    await service.bulkDeleteAllFailed('tenant-a', 'user-a');
    expect(outbox.updateMany.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', webhookId: { $in: [ownId] } });
    expect(outbox.deleteMany.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', webhookId: { $in: [ownId] } });
  });
  it('rejects replay of another user’s personal subscription', async () => {
    outbox.findOne.mockResolvedValue({ _id: ownId, webhookId: otherId });
    vi.spyOn(Webhook, 'findOne').mockReturnValue({ lean: async () => null });
    await expect(service.replayDelivery('tenant-a', String(ownId), 'user-a')).rejects.toThrow('not found');
    expect(Webhook.findOne.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', $or: [{ scope: { $ne: 'personal' } }, { scope: 'personal', ownerUserId: 'user-a' }] });
    expect(outbox.updateOne).not.toHaveBeenCalled();
  });
});
