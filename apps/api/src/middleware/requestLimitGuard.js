const localRedisClient = require('../lib/localRedis');

const SKIP_PATH_PREFIXES = [
  '/health',
  '/ready',
  '/api-usage-sync',
  '/api/subscription-plans',
  '/api/tenants/current/limits',
];

const SKIP_PATH_REGEXES = [
  /^\/api\/tenants\/[^/]+\/subscription/, // allow upgrades
  /^\/api\/tenants\/[^/]+\/limits/, // allow viewing limits
];

function shouldSkipLimitGuard(request) {
  const url = request.url || '';
  if (SKIP_PATH_PREFIXES.some(prefix => url.startsWith(prefix))) {
    return true;
  }
  return SKIP_PATH_REGEXES.some(pattern => pattern.test(url));
}

function resolveLanguage(request) {
  const header = request.headers?.['accept-language'] || '';
  const normalized = Array.isArray(header) ? header.join(',') : header;
  return normalized.toLowerCase().includes('tr') ? 'tr' : 'en';
}

function getResetAt(periodKey) {
  if (!periodKey) {
    return null;
  }

  const [yearRaw, monthRaw] = periodKey.split('-');
  const year = parseInt(yearRaw, 10);
  const month = parseInt(monthRaw, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  const resetAt = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return resetAt.toISOString();
}

async function checkRequestLimit(request, reply) {
  if (shouldSkipLimitGuard(request)) {
    return false;
  }

  if (!localRedisClient.isEnabled()) {
    return false;
  }

  const tenantId = request.tenantId;
  if (!tenantId) {
    return false;
  }

  const flag = await localRedisClient.getRequestLimitFlag(tenantId);
  if (!flag || !flag.exceeded) {
    return false;
  }

  const messages = {
    tr: 'Aylık API isteği limiti aşıldı. Lütfen paketinizi yükseltin veya yeni dönemi bekleyin.',
    en: 'Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle.',
  };
  const lang = resolveLanguage(request);

  reply.code(429).send({
    error: 'RequestLimitExceeded',
    message: messages[lang],
    messages,
    limit: flag.limit ?? null,
    usage: flag.usage ?? null,
    periodKey: flag.periodKey ?? null,
    resetAt: getResetAt(flag.periodKey),
  });

  return true;
}

module.exports = {
  checkRequestLimit,
  shouldSkipLimitGuard,
};
