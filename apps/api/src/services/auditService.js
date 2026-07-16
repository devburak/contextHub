const crypto = require('crypto');
const ActivityLog = require('@contexthub/common/src/models/ActivityLog');

function extractIp(request) {
  if (Array.isArray(request?.ips) && request.ips.length) {
    return request.ips.find(Boolean);
  }

  const forwarded = request?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',').map((value) => value.trim()).find(Boolean);
  }

  return request?.headers?.['cf-connecting-ip']
    || request?.headers?.['x-real-ip']
    || request?.ip
    || request?.socket?.remoteAddress
    || null;
}

function hashIdentifier(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

async function logSecurityEvent({
  action,
  description,
  userId = null,
  tenantId = null,
  metadata = {},
  request = null,
}) {
  try {
    const payload = {
      action,
      description,
      metadata,
      ipAddress: extractIp(request),
      userAgent: request?.headers?.['user-agent'] || null,
    };

    if (userId) payload.user = userId;
    if (tenantId) payload.tenant = tenantId;

    return await ActivityLog.create(payload);
  } catch (error) {
    console.error('[Audit] Failed to write security event:', {
      action,
      error: error.message,
    });
    return null;
  }
}

module.exports = {
  extractIp,
  hashIdentifier,
  logSecurityEvent,
};
