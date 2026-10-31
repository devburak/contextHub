import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Fastify = require('fastify');
const routes = require('./billingWebhooks');
const billingService = require('../services/billing/billingService');
const webhookService = require('../services/billing/billingWebhookService');
const apps = [];

async function buildApp(bodyLimit = 1024) {
  const app = Fastify({ bodyLimit });
  apps.push(app);
  await app.register(routes, { prefix: '/api' });
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('billing HTTP contracts after the Fastify upgrade', () => {
  it('redirects successful checkout POSTs with 303 so browsers follow with GET', async () => {
    vi.stubEnv('ADMIN_URL', 'https://admin.example.test');
    vi.spyOn(billingService, 'completeIyzicoCheckout').mockResolvedValue({});
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST', url: '/api/billing/callbacks/iyzico', payload: { token: 'test-token' },
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('https://admin.example.test/billing?checkout=success');
  });

  it('keeps failed checkout and card-update callbacks on the configured Admin origin', async () => {
    vi.stubEnv('ADMIN_URL', 'https://admin.example.test');
    const app = await buildApp();
    const failed = await app.inject({ method: 'POST', url: '/api/billing/callbacks/iyzico', payload: {} });
    expect(failed.statusCode).toBe(303);
    expect(failed.headers.location).toBe('https://admin.example.test/billing?checkout=failed');
    for (const method of ['GET', 'POST']) {
      const response = await app.inject({ method, url: '/api/billing/callbacks/iyzico/card-update' });
      expect(response.statusCode).toBe(303);
      expect(response.headers.location).toBe('https://admin.example.test/billing?payment_method=updated');
    }
  });

  it('rejects an oversized Paddle body before buffering it for signature validation', async () => {
    const accept = vi.spyOn(webhookService, 'acceptPaddleEvent');
    const app = await buildApp(64);
    const response = await app.inject({
      method: 'POST', url: '/api/billing/webhooks/paddle', payload: { data: 'x'.repeat(128) },
    });
    expect(response.statusCode).toBe(413);
    expect(accept).not.toHaveBeenCalled();
  });

  it('preserves the exact signed bytes of an accepted Paddle body', async () => {
    const accept = vi.spyOn(webhookService, 'acceptPaddleEvent')
      .mockResolvedValue({ event: { status: 'processed' }, duplicate: false });
    const body = '{ "event_id": "evt_test", "data": {} }';
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST', url: '/api/billing/webhooks/paddle', payload: body,
      headers: { 'content-type': 'application/json', 'paddle-signature': 'test-signature' },
    });
    expect(response.statusCode).toBe(202);
    expect(accept).toHaveBeenCalledWith(Buffer.from(body), 'test-signature');
  });
});
