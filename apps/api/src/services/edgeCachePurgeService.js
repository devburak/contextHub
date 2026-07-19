const CACHE_INVALIDATING_EVENT_TYPES = new Set([
  'content.created',
  'content.updated',
  'content.published',
  'content.unpublished',
  'content.deleted',
  'form.created',
  'form.updated',
  'placement.created',
  'placement.updated',
  'placement.deleted',
  'menu.created',
  'menu.updated',
  'menu.deleted',
  'tenantSettings.updated',
  'media.updated',
  'collection.created',
  'collection.updated',
  'collection.entry.created',
  'collection.entry.updated',
  'collection.entry.deleted',
]);

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function getApiToken() {
  return process.env.CF_CACHE_PURGE_API_TOKEN || process.env.CF_API_TOKEN;
}

function isEnabled() {
  return envFlag('CF_EDGE_CACHE_PURGE_ENABLED', false)
    && Boolean(process.env.CF_ZONE_ID)
    && Boolean(getApiToken());
}

function getTenantCacheTag(tenantId) {
  return `ctxhub-tenant-${String(tenantId)}`;
}

function shouldPurgeForEvent(type) {
  return CACHE_INVALIDATING_EVENT_TYPES.has(type);
}

async function purgeTenantCache(tenantId) {
  if (!isEnabled()) {
    return { skipped: true, reason: 'edge_cache_purge_disabled' };
  }

  if (!tenantId) {
    return { skipped: true, reason: 'tenant_id_missing' };
  }

  const tag = getTenantCacheTag(tenantId);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${process.env.CF_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags: [tag] }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Cloudflare cache purge failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return {
    skipped: false,
    tenantId: String(tenantId),
    tag,
  };
}

async function purgeTenantCacheForDomainEvent(event) {
  if (!event || !shouldPurgeForEvent(event.type)) {
    return { skipped: true, reason: 'event_does_not_invalidate_cache' };
  }

  return purgeTenantCache(event.tenantId);
}

module.exports = {
  isEnabled,
  getTenantCacheTag,
  shouldPurgeForEvent,
  purgeTenantCache,
  purgeTenantCacheForDomainEvent,
};
