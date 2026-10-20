const crypto = require('node:crypto');

function credentialsKey() {
  const value = process.env.WEBHOOK_CREDENTIALS_KEY;
  if (!value || Buffer.from(value, 'base64').length !== 32) {
    throw new Error('WEBHOOK_CREDENTIALS_KEY must be a base64 encoded 32-byte key');
  }
  return Buffer.from(value, 'base64');
}

function encryptCredentials(config, tenantId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', credentialsKey(), iv);
  cipher.setAAD(Buffer.from(String(tenantId)));
  const data = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
}

function decryptCredentials(value, tenantId) {
  const [iv, tag, data] = value.split('.').map((part) => Buffer.from(part, 'base64'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', credentialsKey(), iv);
  cipher.setAAD(Buffer.from(String(tenantId)));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}

function required(config, key, pattern) {
  const value = typeof config?.[key] === 'string' ? config[key].trim() : '';
  if (!value || value.length > 4096 || (pattern && !pattern.test(value))) {
    throw new Error(`Invalid integration setting: ${key}`);
  }
  return value;
}

function normalizeIntegration(provider, config) {
  if (provider === 'slack') {
    const url = required(config, 'webhookUrl');
    const parsed = new URL(url);
    if (parsed.origin !== 'https://hooks.slack.com' || !/^\/services\/[A-Za-z0-9/_-]+$/.test(parsed.pathname)
      || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('Invalid Slack webhook URL');
    }
    return { webhookUrl: url, channel: String(config.channel || '').slice(0, 200) };
  }
  if (provider === 'telegram') {
    return {
      botToken: required(config, 'botToken', /^\d+:[A-Za-z0-9_-]+$/),
      chatId: required(config, 'chatId', /^(?:-?\d+|@[A-Za-z0-9_]{5,})$/)
    };
  }
  if (provider === 'whatsapp') {
    return {
      accessToken: required(config, 'accessToken', /^[A-Za-z0-9._|-]+$/),
      phoneNumberId: required(config, 'phoneNumberId', /^\d+$/),
      recipient: required(config, 'recipient', /^\d{7,15}$/),
      templateName: required(config, 'templateName', /^[a-z0-9_]+$/),
      language: required(config, 'language', /^[a-z]{2,3}(?:_[A-Z]{2})?$/)
    };
  }
  throw new Error('Invalid integration provider');
}

function publicIntegration(provider, config) {
  if (provider === 'slack') return { channel: config.channel };
  if (provider === 'telegram') return { chatId: config.chatId };
  if (provider === 'whatsapp') {
    return Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'accessToken'));
  }
  return {};
}

function buildDeliveryRequest(webhook, event, { signPayload, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const provider = webhook.provider || 'webhook';
  if (provider === 'webhook') {
    const body = JSON.stringify(event);
    const sign = signPayload || ((secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex'));
    return {
      url: webhook.url,
      body,
      headers: {
        'Content-Type': 'application/json',
        // Keep existing consumers working while they migrate to timestamp verification.
        'X-CTXHUB-SIGNATURE': sign(webhook.secret, body),
        'X-CTXHUB-SIGNATURE-V2': `v1=${sign(webhook.secret, `${timestamp}.${body}`)}`,
        'X-CTXHUB-TIMESTAMP': String(timestamp),
        'X-CTXHUB-EVENT': event.type,
        'X-CTXHUB-DELIVERY-ID': `${event.id}:${webhook._id}`
      }
    };
  }
  const config = normalizeIntegration(provider, decryptCredentials(webhook.configEncrypted, webhook.tenantId));
  const summary = `ContextHub · ${event.type}\nTenant: ${event.tenantId}\nEvent: ${event.id}\n${event.occurredAt || ''}`;
  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'slack') {
    return { url: config.webhookUrl, headers, body: JSON.stringify({ text: summary, mrkdwn: false }) };
  }
  if (provider === 'telegram') {
    return {
      url: `https://api.telegram.org/bot${config.botToken}/sendMessage`, headers,
      body: JSON.stringify({ chat_id: config.chatId, text: summary, link_preview_options: { is_disabled: true } })
    };
  }
  const version = process.env.WHATSAPP_GRAPH_API_VERSION;
  if (!/^v\d+\.\d+$/.test(version || '')) throw new Error('WHATSAPP_GRAPH_API_VERSION is required');
  return {
    url: `https://graph.facebook.com/${version}/${config.phoneNumberId}/messages`,
    headers: { ...headers, Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: config.recipient, type: 'template',
      template: {
        name: config.templateName, language: { code: config.language },
        components: [{ type: 'body', parameters: [event.type, event.id, event.tenantId].map((text) => ({ type: 'text', text: String(text) })) }]
      }
    })
  };
}

// Never buffer an untrusted response in full, even if the server sends an endless stream.
async function readResponseSnippet(response, maxBytes = 2048) {
  if (!response?.body?.getReader) return response?.text ? (await response.text()).slice(0, maxBytes) : null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { value, done } = await reader.read();
      if (done) break;
      const part = Buffer.from(value).subarray(0, maxBytes - size);
      chunks.push(part);
      size += part.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = { buildDeliveryRequest, encryptCredentials, decryptCredentials, normalizeIntegration, publicIntegration, readResponseSnippet };
