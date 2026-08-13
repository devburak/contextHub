const net = require('node:net');

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.find(Boolean) || '';
  }
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIp(value) {
  const candidate = firstHeaderValue(value);
  if (!candidate) return null;

  const unwrapped = candidate.startsWith('[') && candidate.endsWith(']')
    ? candidate.slice(1, -1)
    : candidate;

  return net.isIP(unwrapped) ? unwrapped.toLowerCase() : null;
}

/**
 * Resolve the security-sensitive client identifier without trusting the
 * attacker-controlled left-most X-Forwarded-For value. Production traffic is
 * required to pass through Cloudflare, which overwrites CF-Connecting-IP.
 * Direct/local traffic falls back to the TCP peer address.
 */
function extractTrustedClientIp(request) {
  const cloudflareIp = normalizeIp(request?.headers?.['cf-connecting-ip']);
  if (cloudflareIp) return cloudflareIp;

  const socketIp = normalizeIp(
    request?.raw?.socket?.remoteAddress || request?.socket?.remoteAddress
  );
  if (socketIp) return socketIp;

  return 'unknown';
}

module.exports = {
  extractTrustedClientIp,
  normalizeIp,
};
