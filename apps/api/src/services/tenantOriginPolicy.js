const { Domain, Tenant, TenantSettings } = require('@contexthub/common');

const POLICY_CACHE_TTL_MS = Number(process.env.TENANT_ORIGIN_CACHE_TTL_MS) || 60 * 1000;

let policyCache = {
  expiresAt: 0,
  policies: [],
};

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

function getAdminOrigins() {
  const explicitOrigins = envList('AUTH_TRUSTED_ORIGINS');
  const legacyOrigins = explicitOrigins.length ? [] : envList('CORS_ORIGIN');
  const origins = [
    ...explicitOrigins,
    ...legacyOrigins,
    ...envList('ADMIN_URL'),
  ];

  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:3100',
      'http://localhost:5173',
      'http://127.0.0.1:3100',
      'http://127.0.0.1:5173'
    );
  }

  return new Set(origins);
}

function isLocalDevelopmentOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const { hostname } = new URL(normalized);
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function wildcardMatches(origin, allowedOrigin) {
  const normalizedOrigin = normalizeOrigin(origin);
  const candidate = String(allowedOrigin || '').trim().toLowerCase();
  if (!normalizedOrigin || !candidate.includes('*')) {
    return false;
  }

  const wildcardUrl = candidate.replace('://*.', '://wildcard.');
  const normalizedWildcard = normalizeOrigin(wildcardUrl);
  if (!normalizedWildcard) {
    return false;
  }

  const requestUrl = new URL(normalizedOrigin);
  const patternUrl = new URL(normalizedWildcard);
  const suffix = patternUrl.hostname.replace(/^wildcard\./, '');

  return requestUrl.protocol === patternUrl.protocol
    && requestUrl.port === patternUrl.port
    && requestUrl.hostname.endsWith(`.${suffix}`)
    && requestUrl.hostname !== suffix;
}

function originMatchesPolicy(origin, policy) {
  const normalized = normalizeOrigin(origin);
  if (!normalized || !policy) return false;

  if (policy.allowLocalhost && isLocalDevelopmentOrigin(normalized)) {
    return true;
  }

  return policy.allowedOrigins.some((allowedOrigin) => {
    const exact = normalizeOrigin(allowedOrigin);
    return exact === normalized || wildcardMatches(normalized, allowedOrigin);
  });
}

function extractTenantId(request) {
  const queryTenantId = request.query?.tenantId;
  const headerTenantId = request.headers?.['x-tenant-id'];
  return queryTenantId || headerTenantId || null;
}

async function loadPolicies() {
  const now = Date.now();
  if (policyCache.expiresAt > now) {
    return policyCache.policies;
  }

  const [tenants, settings, verifiedDomains] = await Promise.all([
    Tenant.find({ status: 'active' }).select('_id').lean(),
    TenantSettings.find({}).select('tenantId edgeGateway').lean(),
    Domain.find({ status: 'verified' }).select('tenantId host').lean(),
  ]);

  const activeTenantIds = new Set(tenants.map((tenant) => tenant._id.toString()));
  const policiesByTenant = new Map();

  for (const setting of settings) {
    const tenantId = setting.tenantId?.toString();
    if (!tenantId || !activeTenantIds.has(tenantId)) continue;

    policiesByTenant.set(tenantId, {
      tenantId,
      allowLocalhost: setting.edgeGateway?.allowLocalhost ?? true,
      allowedOrigins: Array.from(new Set(
        (setting.edgeGateway?.allowedOrigins || [])
          .map((origin) => String(origin || '').trim())
          .filter(Boolean)
      )),
    });
  }

  for (const domain of verifiedDomains) {
    const tenantId = domain.tenantId?.toString();
    if (!tenantId || !activeTenantIds.has(tenantId)) continue;

    const policy = policiesByTenant.get(tenantId) || {
      tenantId,
      allowLocalhost: true,
      allowedOrigins: [],
    };
    policy.allowedOrigins.push(`https://${String(domain.host).toLowerCase()}`);
    policy.allowedOrigins = Array.from(new Set(policy.allowedOrigins));
    policiesByTenant.set(tenantId, policy);
  }

  policyCache = {
    expiresAt: now + POLICY_CACHE_TTL_MS,
    policies: Array.from(policiesByTenant.values()),
  };
  return policyCache.policies;
}

function invalidateTenantOriginPolicyCache() {
  policyCache = { expiresAt: 0, policies: [] };
}

async function isTenantPublicOriginAllowed(request, origin) {
  const policies = await loadPolicies();
  const requestedTenantId = extractTenantId(request);

  if (requestedTenantId) {
    const policy = policies.find((item) => item.tenantId === requestedTenantId.toString());
    return originMatchesPolicy(origin, policy);
  }

  // Preflight requests do not carry Authorization or custom header values. Allow
  // a known tenant origin at the CORS layer; the actual request still has to pass
  // tenant context, API-token, scope and membership checks.
  return policies.some((policy) => originMatchesPolicy(origin, policy));
}

async function resolveCorsOptions(request) {
  const origin = normalizeOrigin(request.headers?.origin);
  const common = {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key', 'X-CSRF-Token'],
    strictPreflight: true,
  };

  if (!origin) {
    return { ...common, origin: false, credentials: false };
  }

  if (getAdminOrigins().has(origin)) {
    return { ...common, origin, credentials: true };
  }

  if (await isTenantPublicOriginAllowed(request, origin)) {
    return { ...common, origin, credentials: false };
  }

  return { ...common, origin: false, credentials: false };
}

module.exports = {
  normalizeOrigin,
  getAdminOrigins,
  isLocalDevelopmentOrigin,
  wildcardMatches,
  originMatchesPolicy,
  extractTenantId,
  isTenantPublicOriginAllowed,
  resolveCorsOptions,
  invalidateTenantOriginPolicyCache,
};
