import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { buildDeliveryRequest, encryptCredentials, decryptCredentials, normalizeIntegration, publicIntegration, readResponseSnippet } = require('./webhookDelivery');
const event = { id: 'evt', tenantId: 'tenant-a', type: 'content.published', occurredAt: '2026-10-19T00:00:00Z' };
afterEach(() => vi.unstubAllEnvs());
function hook(provider, config) {
  vi.stubEnv('WEBHOOK_CREDENTIALS_KEY', Buffer.alloc(32, 7).toString('base64'));
  return { provider, tenantId: 'tenant-a', configEncrypted: encryptCredentials(config, 'tenant-a') };
}
describe('delivery authentication and adapters', () => {
  it.each(['webhook', 'slack', 'telegram', 'whatsapp'])('rejects foreign tenant payloads before building a %s request', (provider) => {
    expect(() => buildDeliveryRequest({ provider, tenantId: 'tenant-b' }, event)).toThrow('tenant mismatch');
    expect(() => buildDeliveryRequest({ provider }, event)).toThrow('tenant mismatch');
  });
  it('binds the timestamp and exact body while retaining the legacy signature', () => {
    const delivery = buildDeliveryRequest({ tenantId: 'tenant-a', url: 'https://example.com', secret: 'secret', _id: 'hook' }, event, { timestamp: 123 });
    const hmac = (value) => crypto.createHmac('sha256', 'secret').update(value).digest('hex');
    expect(delivery.headers['X-CTXHUB-SIGNATURE']).toBe(hmac(delivery.body));
    expect(delivery.headers['X-CTXHUB-SIGNATURE-V2']).toBe(`v1=${hmac(`123.${delivery.body}`)}`);
    expect(delivery.headers['X-CTXHUB-DELIVERY-ID']).toBe('evt:hook');
  });
  it('encrypts credentials and rejects decryption in another tenant', () => {
    const stored = hook('telegram', { botToken: '123:secret' });
    expect(stored.configEncrypted).not.toContain('secret');
    expect(decryptCredentials(stored.configEncrypted, 'tenant-a')).toEqual({ botToken: '123:secret' });
    expect(() => decryptCredentials(stored.configEncrypted, 'tenant-b')).toThrow();
  });
  it('requires a valid encryption key', () => {
    vi.stubEnv('WEBHOOK_CREDENTIALS_KEY', '');
    expect(() => encryptCredentials({}, 'tenant')).toThrow('WEBHOOK_CREDENTIALS_KEY');
  });
  it('sends Telegram to a fixed host and keeps the token out of public settings', () => {
    const config = { botToken: '123:secret', chatId: '-10012345' };
    const delivery = buildDeliveryRequest(hook('telegram', config), event);
    expect(delivery.url).toBe('https://api.telegram.org/bot123:secret/sendMessage');
    expect(JSON.parse(delivery.body)).toMatchObject({ chat_id: '-10012345', text: expect.stringContaining('content.published') });
    expect(publicIntegration('telegram', config)).toEqual({ chatId: '-10012345' });
    expect(() => normalizeIntegration('telegram', { ...config, botToken: '123:secret/../../evil' })).toThrow();
  });
  it('uses Slack plain text and disallows credential URL exfiltration', () => {
    const delivery = buildDeliveryRequest(hook('slack', { webhookUrl: 'https://hooks.slack.com/services/T/B/secret', channel: '#ops' }), event);
    expect(JSON.parse(delivery.body)).toMatchObject({ mrkdwn: false });
    for (const webhookUrl of ['https://evil.example/services/T/B/secret', 'https://hooks.slack.com@evil.example/services/T/B/secret']) {
      expect(() => normalizeIntegration('slack', { webhookUrl })).toThrow();
    }
  });
  it('sends an approved WhatsApp template to the configured API version', () => {
    vi.stubEnv('WHATSAPP_GRAPH_API_VERSION', 'v99.0');
    const config = { accessToken: 'private-token', phoneNumberId: '12345', recipient: '905551234567', templateName: 'ctxhub_event', language: 'tr' };
    const delivery = buildDeliveryRequest(hook('whatsapp', config), event);
    expect(delivery.url).toBe('https://graph.facebook.com/v99.0/12345/messages');
    expect(delivery.headers.Authorization).toBe('Bearer private-token');
    expect(JSON.parse(delivery.body).to).toBe(config.recipient);
    expect(JSON.parse(delivery.body).template.components[0].parameters.map((p) => p.text)).toEqual(['content.published', 'evt', 'tenant-a']);
    expect(publicIntegration('whatsapp', config)).not.toHaveProperty('accessToken');
  });
  it('cancels an unbounded response after the preview limit', async () => {
    const cancel = vi.fn().mockResolvedValue();
    const read = vi.fn().mockResolvedValue({ value: Buffer.alloc(10000, 65), done: false });
    expect((await readResponseSnippet({ body: { getReader: () => ({ read, cancel }) } })).length).toBe(2048);
    expect(read).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
