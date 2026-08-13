import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  closeWebhookDispatcher,
  prepareSafeWebhookRequest,
  validateWebhookUrl,
} = require('./webhookUrlSecurity');

describe('webhook URL security', () => {
  let originalNodeEnv;
  let originalPrivateOverride;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalPrivateOverride = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    process.env.NODE_ENV = 'production';
    delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalPrivateOverride === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    else process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = originalPrivateOverride;
  });

  it('accepts public HTTPS targets', () => {
    expect(validateWebhookUrl('https://hooks.example.com/events')).toBe(
      'https://hooks.example.com/events'
    );
  });

  it.each([
    'http://hooks.example.com/events',
    'file:///etc/passwd',
    'https://user:password@hooks.example.com/events',
    'https://localhost/events',
    'https://127.0.0.1/events',
    'https://[::7f00:1]/events',
    'https://[::ffff:7f00:1]/events',
  ])('rejects unsafe target %s', (url) => {
    expect(() => validateWebhookUrl(url)).toThrow();
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    await expect(prepareSafeWebhookRequest('https://hooks.example.com/events', {
      lookup: async () => [{ address: '10.10.0.5', family: 4 }],
    })).rejects.toMatchObject({ code: 'WEBHOOK_URL_BLOCKED' });
  });

  it('pins a validated public DNS result for the outbound connection', async () => {
    const prepared = await prepareSafeWebhookRequest('https://hooks.example.com/events', {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    });

    expect(prepared.url).toBe('https://hooks.example.com/events');
    expect(prepared.dispatcher).toBeTruthy();
    await closeWebhookDispatcher(prepared.dispatcher);
  });
});
