// Compare stable tenant identifiers only. Slugs must never expand delivery scope.
function tenantKey(value) {
  if (typeof value?.toHexString === 'function') return value.toHexString();
  if (typeof value !== 'string' || !value.trim()) return null;
  return /^[a-fA-F0-9]{24}$/.test(value) ? value.toLowerCase() : value;
}

function sameWebhookTenant(left, right) {
  const key = tenantKey(left);
  return key !== null && key === tenantKey(right);
}

function assertWebhookTenant(left, right) {
  if (sameWebhookTenant(left, right)) return;
  const error = new Error('Webhook tenant mismatch');
  error.code = 'WEBHOOK_TENANT_MISMATCH';
  throw error;
}

module.exports = { tenantKey, sameWebhookTenant, assertWebhookTenant };
