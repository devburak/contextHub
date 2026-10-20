import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recordWebhookHealth, notifyDisabledWebhooks } = require('./webhookHealth');
const { Membership, User } = require('@contexthub/common');
const { mailService } = require('./mailService');
afterEach(() => vi.restoreAllMocks());
describe('webhook circuit breaker and owner alerts', () => {
  it('counts failures atomically and disables only an active endpoint at the threshold', async () => {
    const updateOne = vi.fn();
    await recordWebhookHealth({ updateOne }, { _id: 'hook', tenantId: 'tenant' }, false, 10);
    expect(updateOne.mock.calls[0]).toEqual([{ _id: 'hook', tenantId: 'tenant', isActive: true }, { $inc: { consecutiveFailures: 1 } }]);
    expect(updateOne.mock.calls[1][0]).toMatchObject({ consecutiveFailures: { $gte: 10 } });
    expect(updateOne.mock.calls[1][1].$set).toMatchObject({ isActive: false, notificationPending: true, disabledAt: expect.any(Date) });
  });
  it('resets consecutive failures after success', async () => {
    const updateOne = vi.fn();
    await recordWebhookHealth({ updateOne }, { _id: 'hook', tenantId: 'tenant' }, true);
    expect(updateOne).toHaveBeenCalledOnce();
    expect(updateOne.mock.calls[0][1]).toEqual({ $set: { consecutiveFailures: 0 } });
  });
  it('keeps owner mail pending after SMTP failure and records success independently', async () => {
    const hook = { _id: 'hook', tenantId: 'tenant', disabledAt: new Date(), notificationPending: true };
    const webhooks = { find: vi.fn(() => ({ limit: () => ({ toArray: async () => [hook] }) })), updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }) };
    vi.spyOn(Membership, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ userId: 'owner' }] }) });
    vi.spyOn(User, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ email: 'owner@example.com' }] }) });
    const send = vi.spyOn(mailService, 'sendMail').mockRejectedValueOnce(new Error('SMTP failure')).mockResolvedValue({});
    await notifyDisabledWebhooks(webhooks, 'tenant');
    expect(webhooks.updateOne).toHaveBeenCalledOnce();
    await notifyDisabledWebhooks(webhooks, 'tenant');
    expect(webhooks.updateOne.mock.calls.at(-1)[1].$set).toMatchObject({ notificationPending: false, notificationSentAt: expect.any(Date) });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com' }), 'tenant');
  });
});
