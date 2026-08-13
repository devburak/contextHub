const localRedisClient = require('../lib/localRedis');

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

// Kota kapisi okunamadiginda istek gecirilir (bilincli fail-open): kullanim
// sayaci bir olcumdur, yetki degildir. Redis coktugu icin butun musterileri
// kesmek, birkac saat fazla servis etmekten daha kotudur. Askiya alma veya plan
// dusurme gibi YETKI kararlari bu kapidan gecmez; onlar tenant status uzerinden
// edge gateway ve authenticate katmanlarinda uygulanir.
//
// Fail-open sessiz olmamali. Her istekte log basmamak icin uyari kisilir.
const FAIL_OPEN_LOG_INTERVAL_MS = 60 * 1000;
let lastFailOpenLogAt = 0;

function logFailOpen(reason) {
  const now = Date.now();
  if (now - lastFailOpenLogAt < FAIL_OPEN_LOG_INTERVAL_MS) {
    return;
  }
  lastFailOpenLogAt = now;
  console.warn(
    `[RequestLimitGuard] fail-open: request quota gate could not be evaluated (reason=${reason}). ` +
      'Monthly request limits are NOT enforced while this persists.'
  );
}

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

function buildQuotaSnapshot(flag, now = Date.now()) {
  const limit = Number(flag?.limit);
  const usage = Number(flag?.usage);
  if (!Number.isFinite(limit) || limit < 0 || !Number.isFinite(usage) || usage < 0) {
    return null;
  }

  const resetAt = flag.resetAt || getResetAt(flag.periodKey);
  const resetTimestamp = resetAt ? Date.parse(resetAt) : Number.NaN;
  const resetSeconds = Number.isFinite(resetTimestamp)
    ? Math.max(0, Math.ceil((resetTimestamp - now) / 1000))
    : null;

  return {
    limit: Math.floor(limit),
    usage: Math.floor(usage),
    remaining: Math.max(0, Math.floor(limit - usage)),
    periodKey: flag.periodKey || null,
    resetAt: resetAt || null,
    resetTimestamp: Number.isFinite(resetTimestamp) ? Math.floor(resetTimestamp / 1000) : null,
    resetSeconds,
  };
}

function setQuotaHeaders(reply, snapshot, { exceeded = false } = {}) {
  if (!snapshot || typeof reply.header !== 'function') {
    return;
  }

  const effectiveWindow = snapshot.resetSeconds !== null ? `;t=${snapshot.resetSeconds}` : '';

  // The structured fields follow the active IETF HTTPAPI draft. X-RateLimit-*
  // remains available for existing clients while the draft stabilises.
  reply.header('RateLimit-Policy', `"monthly";q=${snapshot.limit}`);
  reply.header('RateLimit', `"monthly";r=${snapshot.remaining}${effectiveWindow}`);
  reply.header('X-RateLimit-Limit', String(snapshot.limit));
  reply.header('X-RateLimit-Remaining', String(snapshot.remaining));
  if (snapshot.resetTimestamp !== null) {
    reply.header('X-RateLimit-Reset', String(snapshot.resetTimestamp));
  }
  if (snapshot.periodKey) {
    reply.header('X-RateLimit-Period', snapshot.periodKey);
  }
  if (exceeded && snapshot.resetSeconds !== null) {
    reply.header('Retry-After', String(snapshot.resetSeconds));
  }
}

/**
 * Hot path kota kontrolu.
 *
 * Tek is yapar: tenant icin "kota asildi" bayragini Redis'ten okur (tek GET).
 * Bayrak `apiUsageService.refreshMonthlyLimitFlag` tarafindan hot path DISINDA
 * yazilir: zamanlanmis usage sync ve plan/odeme degisimi. Burada Mongo'ya
 * gidilmez, kullanim yeniden hesaplanmaz, sayac dusurulmez.
 *
 * Sayim tarafi `middleware/apiLogger` icinde onResponse hook'unda, fire-and-forget
 * olarak devam eder.
 *
 * Kabul edilen sapma: bayrak en fazla bir sync periyodu kadar geç yazilir, yani
 * kotasi dolan bir tenant bir sonraki sync'e kadar servis almaya devam eder.
 */
async function checkRequestLimit(request, reply) {
  if (shouldSkipLimitGuard(request)) {
    return false;
  }

  const tenantId = request.tenantId;
  if (!tenantId) {
    return false;
  }

  if (!localRedisClient.isEnabled()) {
    logFailOpen('redis_unavailable');
    return false;
  }

  let flag = null;
  try {
    flag = await localRedisClient.getRequestLimitFlag(tenantId);
  } catch (error) {
    logFailOpen(`redis_error:${error.message}`);
    return false;
  }

  const quotaSnapshot = buildQuotaSnapshot(flag);
  setQuotaHeaders(reply, quotaSnapshot, { exceeded: flag?.exceeded === true });

  // Only an explicit, valid exceeded snapshot may reject traffic. Missing or
  // malformed state follows the documented metering fail-open policy.
  if (flag?.exceeded !== true) {
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
    limit: flag.limit ?? null,
    usage: flag.usage ?? null,
    periodKey: flag.periodKey ?? null,
    resetAt: quotaSnapshot?.resetAt || flag.resetAt || getResetAt(flag.periodKey),
  });

  return true;
}

module.exports = {
  buildQuotaSnapshot,
  checkRequestLimit,
  setQuotaHeaders,
  shouldSkipLimitGuard,
};
