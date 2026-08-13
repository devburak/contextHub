const dns = require('node:dns').promises;
const net = require('node:net');
const { Agent } = require('undici');

const blockedAddresses = new net.BlockList();

[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv4'));

[
  ['::', 96],
  ['::1', 128],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv6'));

function securityError(message) {
  const error = new Error(message);
  error.code = 'WEBHOOK_URL_BLOCKED';
  return error;
}

function allowPrivateTargets() {
  return process.env.NODE_ENV !== 'production'
    && ['1', 'true', 'yes', 'on'].includes(
      String(process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS || '').trim().toLowerCase()
    );
}

function allowInsecureHttp() {
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

function unwrapHostname(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function isBlockedAddress(address, family = net.isIP(address)) {
  if (!family) return true;

  if (family === 6) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) {
      return isBlockedAddress(mapped[1], 4);
    }
  }

  return blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

function validateWebhookUrl(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new Error('Webhook URL is required');
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch (error) {
    throw new Error('Webhook URL is invalid');
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw securityError('Webhook URL must use HTTP or HTTPS');
  }
  if (parsed.protocol !== 'https:' && !allowInsecureHttp()) {
    throw securityError('Webhook URL must use HTTPS in production');
  }
  if (parsed.username || parsed.password) {
    throw securityError('Webhook URL must not include credentials');
  }

  const hostname = unwrapHostname(parsed.hostname).toLowerCase();
  if (!hostname) {
    throw new Error('Webhook URL is invalid');
  }

  const localHostname = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.home.arpa');

  if (!allowPrivateTargets() && localHostname) {
    throw securityError('Webhook URL must not target a local or internal host');
  }

  const literalFamily = net.isIP(hostname);
  if (!allowPrivateTargets() && literalFamily && isBlockedAddress(hostname, literalFamily)) {
    throw securityError('Webhook URL must not target a private or reserved address');
  }

  return parsed.toString();
}

async function prepareSafeWebhookRequest(value, options = {}) {
  const url = validateWebhookUrl(value);
  const parsed = new URL(url);
  const hostname = unwrapHostname(parsed.hostname);
  const lookup = options.lookup || dns.lookup;
  const literalFamily = net.isIP(hostname);
  const records = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (!Array.isArray(records) || records.length === 0) {
    throw securityError('Webhook hostname did not resolve');
  }

  const normalizedRecords = records.map((record) => ({
    address: record.address,
    family: Number(record.family) || net.isIP(record.address),
  }));

  if (!allowPrivateTargets() && normalizedRecords.some((record) => (
    isBlockedAddress(record.address, record.family)
  ))) {
    throw securityError('Webhook hostname resolves to a private or reserved address');
  }

  const pinned = normalizedRecords[0];
  const dispatcher = new Agent({
    connect: {
      lookup(requestedHostname, lookupOptions, callback) {
        if (requestedHostname.toLowerCase() !== hostname.toLowerCase()) {
          callback(securityError('Webhook redirect target is not allowed'));
          return;
        }
        if (lookupOptions?.all) {
          callback(null, [pinned]);
          return;
        }
        callback(null, pinned.address, pinned.family);
      },
    },
  });

  return { url, dispatcher };
}

async function closeWebhookDispatcher(dispatcher) {
  if (dispatcher && typeof dispatcher.close === 'function') {
    await dispatcher.close();
  }
}

module.exports = {
  closeWebhookDispatcher,
  isBlockedAddress,
  prepareSafeWebhookRequest,
  validateWebhookUrl,
};
