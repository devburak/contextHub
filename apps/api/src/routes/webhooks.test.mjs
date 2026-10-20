import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Fastify = require('fastify');
const auth = require('../middleware/auth');
const service = require('../services/webhookService');
const tenantId = '64b000000000000000000001';
const { PERMISSIONS } = require('@contexthub/common').rbac;
const realRequirePermission = auth.requirePermission;
let app;
beforeEach(async () => {
  vi.spyOn(auth, 'tenantContext').mockImplementation(async (request) => { request.tenantId = request.params.tenantId; });
  vi.spyOn(auth, 'authenticate').mockImplementation(async (request) => {
    request.tenantId = tenantId; request.user = { _id: 'user' };
    request.userPermissions = request.headers['x-test-view-only'] ? [PERMISSIONS.TENANTS_VIEW] : [PERMISSIONS.TENANTS_MANAGE];
  });
  vi.spyOn(auth, 'requirePermission').mockImplementation(realRequirePermission);
  delete require.cache[require.resolve('./webhooks')];
  app = Fastify(); await app.register(require('./webhooks'));
});
afterEach(async () => { await app.close(); vi.restoreAllMocks(); delete require.cache[require.resolve('./webhooks')]; });
describe('webhook HTTP tenant isolation and serialization', () => {
  it('requires tenant management permission before exposing delivery body previews', async () => {
    const getDeliveries = vi.spyOn(service, 'getDeliveries').mockResolvedValue({ items: [] });
    const response = await app.inject({ url: `/admin/tenants/${tenantId}/webhooks/deliveries`, headers: { 'x-test-view-only': '1' } });
    expect(response.statusCode).toBe(403);
    expect(getDeliveries).not.toHaveBeenCalled();
  });
  it.each([
    ['GET', '/webhooks'], ['POST', '/webhooks'], ['GET', '/webhooks/queue'], ['GET', '/webhooks/deliveries'],
    ['POST', '/webhooks/slack/connect'], ['PUT', '/webhooks/64b000000000000000000003'],
    ['POST', '/webhooks/64b000000000000000000003/test'], ['POST', '/webhooks/deliveries/64b000000000000000000003/replay']
  ])('rejects cross-tenant token use: %s %s', async (method, path) => {
    const result = await app.inject({ method, url: `/admin/tenants/64b000000000000000000002${path}`, ...(method === 'POST' || method === 'PUT' ? { payload: {} } : {}) });
    expect(result.statusCode).toBe(403);
  });
  it('preserves dead queue items, HTTP status and timing in serialized responses', async () => {
    vi.spyOn(service, 'getWebhookQueueStatus').mockResolvedValue({ domainEvents: { totalPending: 0, items: [] }, outbox: {
      totalPending: 0, totalFailed: 0, totalDead: 1, pendingItems: [], failedItems: [], deadItems: [
        { id: 'delivery', webhookId: 'hook', type: 'content.updated', status: 'dead', lastHttpStatus: 401, lastDurationMs: 0, errorType: 'permanent', nextRetryAt: null }
      ]
    } });
    const result = await app.inject(`/admin/tenants/${tenantId}/webhooks/queue`);
    expect(result.statusCode).toBe(200);
    expect(result.json().outbox).toMatchObject({ totalDead: 1, deadItems: [{ webhookId: 'hook', lastHttpStatus: 401, lastDurationMs: 0 }] });
  });
  it('returns provider settings without stored credentials', async () => {
    vi.spyOn(service, 'listWebhooks').mockResolvedValue([{ id: 'hook', tenantId, provider: 'telegram', integration: { chatId: '123' }, configEncrypted: 'private', secret: 'private', payloadMode: 'ids' }]);
    const response = await app.inject(`/admin/tenants/${tenantId}/webhooks`);
    expect(response.json().webhooks[0]).toMatchObject({ provider: 'telegram', integration: { chatId: '123' }, payloadMode: 'ids' });
    expect(response.body).not.toContain('private');
  });
});
