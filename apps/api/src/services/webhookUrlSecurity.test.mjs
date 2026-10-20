import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';

const require = createRequire(import.meta.url);
const { fetch } = require('undici');
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
    'https://localhost./events',
    'https://[64:ff9b::a00:1]/events',
    'https://[2002:0a00:0001::1]/events',
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
  it('rejects a mixed public/private DNS answer', async () => {
    await expect(prepareSafeWebhookRequest('https://hooks.example.com/events', {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]
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

  it('falls back to a pinned IPv4 address when the IPv6 connection fails', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
    const server = createServer((_request, response) => response.end('delivered'));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    let prepared;
    let lookups = 0;
    try {
      prepared = await prepareSafeWebhookRequest(`http://hooks.example.test:${server.address().port}/events`, {
        lookup: async () => {
          lookups += 1;
          return [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }];
        },
      });
      const response = await fetch(prepared.url, {
        dispatcher: prepared.dispatcher, signal: AbortSignal.timeout(2000),
      });
      expect(await response.text()).toBe('delivered');
      expect(lookups).toBe(1);
    } finally {
      await closeWebhookDispatcher(prepared?.dispatcher);
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
