const apiUsageService = require('../services/apiUsageService');

const SKIP_PATH_PREFIXES = [
  '/health',
  '/ready',
  '/api-usage-sync',
  '/api/subscription-plans',
  '/api/tenants/current/limits',
];

const SKIP_PATH_REGEXES = [
  /^\/api\/tenants\/[^/]+\/subscription/,
  /^\/api\/tenants\/[^/]+\/limits/,
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

  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString();
}

async function checkRequestLimit(request, reply) {
  if (shouldSkipLimitGuard(request)) {
    return false;
  }

  const tenantId = request.tenantId;
  if (!tenantId) {
    return false;
  }

  try {
    const state = await apiUsageService.reserveRequestQuota(tenantId, new Date());
    request.requestQuotaState = state;

    if (!state || state.skipped || state.allowed || state.isUnlimited) {
      return false;
    }

    const messages = {
      tr: 'Aylik API istegi limiti asildi. Lutfen paketinizi yukseltin veya yeni donemi bekleyin.',
      en: 'Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle.',
    };
    const lang = resolveLanguage(request);

    request.requestLimitExceeded = true;

    reply.code(429).send({
      error: 'RequestLimitExceeded',
      message: messages[lang],
      messages,
      limit: state.limit ?? null,
      usage: state.usage ?? null,
      periodKey: state.periodKey ?? null,
      resetAt: state.resetAt?.toISOString?.() || getResetAt(state.periodKey),
    });

    return true;
  } catch (error) {
    console.error('[RequestLimitGuard] Failed to evaluate request limit:', error.message);
    return false;
  }
}

module.exports = {
  checkRequestLimit,
  shouldSkipLimitGuard,
};
