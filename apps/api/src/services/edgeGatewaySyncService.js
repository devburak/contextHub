const { Domain, Tenant, TenantSettings } = require('@contexthub/common');

const DEFAULT_SCHEMA_VERSION = 1;

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function isEnabled() {
  return envFlag('CF_EDGE_GATEWAY_ENABLED', false)
    && Boolean(process.env.CF_ACCOUNT_ID)
    && Boolean(process.env.CF_KV_NAMESPACE_ID)
    && Boolean(process.env.CF_API_TOKEN);
}

function normalizeAllowedOrigins(value) {
  const list = Array.isArray(value) ? value : [];
  return Array.from(new Set(list
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
}

function mapTenantStatus(status) {
  if (status === 'active') {
    return 'active';
  }
  if (['inactive', 'suspended', 'deleted'].includes(status)) {
    return 'suspended';
  }
  return 'suspended';
}

function getKvKey(name) {
  const prefix = process.env.CF_KV_KEY_PREFIX ? String(process.env.CF_KV_KEY_PREFIX) : '';
  return `${prefix}${name}`;
}

function buildTenantPayload({ tenant, settings, domains = [] }) {
  const edgeGateway = settings?.edgeGateway || {};
  const domainOrigins = domains
    .filter((domain) => domain?.status === 'verified' && domain.host)
    .map((domain) => `https://${String(domain.host).trim().toLowerCase()}`);
  return {
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    tenantId: tenant._id.toString(),
    status: mapTenantStatus(tenant.status),
    publicReadEnabled: edgeGateway.publicReadEnabled ?? true,
    allowedOrigins: normalizeAllowedOrigins([
      ...(edgeGateway.allowedOrigins || []),
      ...domainOrigins,
    ]),
    allowLocalhost: edgeGateway.allowLocalhost ?? true,
    updatedAt: new Date().toISOString(),
  };
}

function buildApiTokenPayload({ apiToken, tenant, settings, domains = [] }) {
  const tenantPayload = buildTenantPayload({ tenant, settings, domains });
  return {
    ...tenantPayload,
    tokenId: apiToken._id?.toString?.() || null,
    role: apiToken.role || 'viewer',
    scopes: Array.isArray(apiToken.scopes) && apiToken.scopes.length ? apiToken.scopes : ['read'],
    expiresAt: apiToken.expiresAt ? new Date(apiToken.expiresAt).toISOString() : null,
  };
}

async function putKvJson(key, payload) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Cloudflare KV put failed (${response.status}): ${body}`);
  }

  return response.json().catch(() => ({ success: true }));
}

async function deleteKvKey(key) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Cloudflare KV delete failed (${response.status}): ${body}`);
  }

  return response.json().catch(() => ({ success: true }));
}

async function syncTenantConfig({ tenantId, tenant: tenantInput } = {}) {
  if (!isEnabled()) {
    return { skipped: true, reason: 'edge_gateway_disabled' };
  }

  const tenant = tenantInput || await Tenant.findById(tenantId).lean();
  if (!tenant) {
    return { skipped: true, reason: 'tenant_not_found' };
  }

  const [settings, domains] = await Promise.all([
    TenantSettings.findOne({ tenantId: tenant._id }).lean(),
    Domain.find({ tenantId: tenant._id, status: 'verified' }).select('host status').lean(),
  ]);
  const payload = buildTenantPayload({ tenant, settings, domains });
  const key = getKvKey(`tenant:${tenant._id.toString()}`);

  await putKvJson(key, payload);

  return {
    skipped: false,
    key,
    tenantId: tenant._id.toString(),
    payload,
  };
}

async function syncApiTokenConfig({ apiToken, tenant: tenantInput } = {}) {
  if (!isEnabled()) {
    return { skipped: true, reason: 'edge_gateway_disabled' };
  }

  if (!apiToken?.hash) {
    return { skipped: true, reason: 'api_token_hash_missing' };
  }

  const tenantId = apiToken.tenantId?._id || apiToken.tenantId;
  const tenant = tenantInput || await Tenant.findById(tenantId).lean();
  if (!tenant) {
    return { skipped: true, reason: 'tenant_not_found' };
  }

  const [settings, domains] = await Promise.all([
    TenantSettings.findOne({ tenantId: tenant._id }).lean(),
    Domain.find({ tenantId: tenant._id, status: 'verified' }).select('host status').lean(),
  ]);
  const payload = buildApiTokenPayload({ apiToken, tenant, settings, domains });
  const key = getKvKey(`apikey:${apiToken.hash}`);

  await putKvJson(key, payload);

  return {
    skipped: false,
    key,
    tenantId: tenant._id.toString(),
    tokenId: apiToken._id?.toString?.() || null,
    payload,
  };
}

async function deleteApiTokenConfig({ hash } = {}) {
  if (!isEnabled()) {
    return { skipped: true, reason: 'edge_gateway_disabled' };
  }

  if (!hash) {
    return { skipped: true, reason: 'api_token_hash_missing' };
  }

  const key = getKvKey(`apikey:${hash}`);
  await deleteKvKey(key);

  return {
    skipped: false,
    key,
  };
}

module.exports = {
  isEnabled,
  buildTenantPayload,
  buildApiTokenPayload,
  syncTenantConfig,
  syncApiTokenConfig,
  deleteApiTokenConfig,
};
