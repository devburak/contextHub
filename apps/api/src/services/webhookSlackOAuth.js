const crypto = require('node:crypto');
const { fetch } = require('undici');
const { mongoose } = require('@contexthub/common');
const { createWebhook } = require('./webhookService');
const { encryptCredentials, readResponseSnippet } = require('./webhookDelivery');

const deps = { fetch, createWebhook };
function settings() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Slack OAuth is not configured');
  const url = new URL(redirectUri);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('SLACK_REDIRECT_URI must be an HTTPS admin page URL');
  return { clientId, clientSecret, redirectUri };
}
function states() { return mongoose.connection.db.collection('WebhookOAuthStates'); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

async function beginSlackConnect(tenantId, userId, subscription) {
  if (!userId) throw new Error('Authenticated user required');
  const { clientId, redirectUri } = settings();
  encryptCredentials({}, tenantId); // Fail before redirecting if credentials cannot be stored.
  const state = crypto.randomBytes(32).toString('hex');
  await states().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await states().insertOne({ _id: hash(state), tenantId, userId: String(userId), subscription,
    expiresAt: new Date(Date.now() + 10 * 60_000) });
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.search = new URLSearchParams({ client_id: clientId, scope: 'incoming-webhook', redirect_uri: redirectUri, state }).toString();
  return { authorizeUrl: url.toString() };
}

async function completeSlackConnect(tenantId, userId, { code, state }) {
  if (!userId || !/^[a-f0-9]{64}$/.test(state || '') || typeof code !== 'string' || !code || code.length > 4096) throw new Error('Invalid Slack OAuth callback');
  const { clientId, clientSecret, redirectUri } = settings();
  const result = await states().findOneAndDelete({ _id: hash(state), tenantId, userId: String(userId), expiresAt: { $gt: new Date() } });
  const record = result?.value || result;
  if (!record?._id) throw new Error('Slack connection expired or already used');
  const response = await deps.fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }).toString()
  });
  let data;
  try { data = JSON.parse(await readResponseSnippet(response, 16384)); } catch { throw new Error('Slack authorization failed'); }
  if (!response.ok || !data.ok || !data.incoming_webhook?.url) throw new Error('Slack authorization failed');
  return deps.createWebhook(tenantId, { ...record.subscription, provider: 'slack',
    integration: { webhookUrl: data.incoming_webhook.url, channel: data.incoming_webhook.channel } }, { slackOAuth: true, actorId: String(userId) });
}

module.exports = { beginSlackConnect, completeSlackConnect,
  __setSlackOAuthDeps(overrides = {}) { Object.assign(deps, { fetch, createWebhook }, overrides); } };
