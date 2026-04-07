const { tenantContext } = require('../middleware/auth');
const { checkRequestLimit } = require('../middleware/requestLimitGuard');
const formService = require('../services/formService');
const localRedisClient = require('../lib/localRedis');
const crypto = require('crypto');

/**
 * Rate limiting configuration for form submissions
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // Max 10 submissions per minute per IP
const rateLimitBuckets = new Map();

const RATE_LIMIT_PREFIX = 'form:ratelimit';
const DUPLICATE_PREFIX = 'form:duplicate';
const COOLDOWN_PREFIX = 'form:cooldown';

/**
 * Duplicate submission prevention
 * Prevents the same form data being submitted twice within a short window
 */
const DUPLICATE_WINDOW_MS = 30 * 1000; // 30 seconds (increased from 10)
const recentSubmissions = new Map();

/**
 * Client-based submission cooldown
 * Prevents rapid successive submissions from the same client to the same form
 * Uses a combination of IP + User-Agent + Accept-Language to identify clients
 * This helps distinguish different users behind the same IP (shared hosting, NAT, etc.)
 * Default is 60 seconds, but can be configured per-form via settings.submissionCooldownSeconds
 */
const DEFAULT_CLIENT_COOLDOWN_MS = 60 * 1000; // Default 1 minute cooldown per client per form
const clientFormCooldowns = new Map();

/**
 * Submission fingerprinting for detecting similar submissions
 * Uses client identifier instead of just IP to allow different users behind same IP
 * Even if data is slightly different, detect patterns from the same client
 */
const FINGERPRINT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SUBMISSIONS_PER_FINGERPRINT = 3; // Max 3 similar submissions in 5 minutes per client
const submissionFingerprints = new Map();

function getRedisClient() {
  return localRedisClient.isEnabled() ? localRedisClient.getClient() : null;
}

function toSeconds(ms) {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Generate a client identifier that combines multiple signals
 * This helps distinguish different users behind the same IP
 * @param {string} ip - Client IP address
 * @param {string} userAgent - User-Agent header
 * @param {string} acceptLanguage - Accept-Language header
 * @returns {string} - Hashed client identifier
 */
function generateClientId(ip, userAgent, acceptLanguage) {
  // Normalize user agent - remove version numbers to group similar browsers
  const normalizedUA = (userAgent || 'unknown')
    .replace(/[\d.]+/g, 'X') // Replace version numbers
    .substring(0, 100); // Limit length

  // Use first language preference only
  const lang = (acceptLanguage || 'unknown').split(',')[0].split(';')[0].trim();

  const content = `${ip}:${normalizedUA}:${lang}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Generate a hash for form submission data
 * @param {string} formId - Form ID
 * @param {object} data - Form submission data
 * @param {string} clientId - Client identifier
 * @returns {string} - SHA256 hash
 */
function generateSubmissionHash(formId, data, clientId) {
  const content = JSON.stringify({ formId, data, clientId });
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check if this is a duplicate submission
 * Returns true if duplicate, false if new submission
 * @param {string} formId - Form ID
 * @param {object} data - Form submission data
 * @param {string} clientId - Client identifier (IP or clientId hash)
 * @returns {boolean}
 */
async function isDuplicateSubmission(formId, data, clientId) {
  const hash = generateSubmissionHash(formId, data, clientId);
  const now = Date.now();

  const redisClient = getRedisClient();
  if (redisClient) {
    const key = `${DUPLICATE_PREFIX}:${hash}`;
    const result = await redisClient.set(key, '1', { NX: true, EX: toSeconds(DUPLICATE_WINDOW_MS) });
    return result === null;
  }

  // Clean up old entries
  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > DUPLICATE_WINDOW_MS) {
      recentSubmissions.delete(key);
    }
  }

  // Check if this submission was recently made
  if (recentSubmissions.has(hash)) {
    return true;
  }

  // Record this submission
  recentSubmissions.set(hash, now);
  return false;
}

/**
 * Check and enforce client-based cooldown for a specific form
 * @param {string} formId - Form ID
 * @param {string} clientId - Client identifier (generated from IP + UA + lang)
 * @returns {{ allowed: boolean, remainingMs: number }}
 */
async function checkClientFormCooldown(formId, clientId) {
  const key = `${formId}:${clientId}`;
  const now = Date.now();

  const redisClient = getRedisClient();
  if (redisClient) {
    const redisKey = `${COOLDOWN_PREFIX}:${key}`;
    const ttl = await redisClient.ttl(redisKey);
    if (ttl > 0) {
      return { allowed: false, remainingMs: ttl * 1000 };
    }
    return { allowed: true, remainingMs: 0 };
  }

  // Clean up old entries (run periodically)
  if (clientFormCooldowns.size > 1000) {
    for (const [k, expiresAt] of clientFormCooldowns.entries()) {
      if (now > expiresAt) {
        clientFormCooldowns.delete(k);
      }
    }
  }

  const expiresAt = clientFormCooldowns.get(key);
  if (expiresAt && now < expiresAt) {
    return { allowed: false, remainingMs: expiresAt - now };
  }

  return { allowed: true, remainingMs: 0 };
}

/**
 * Set client-based cooldown after successful submission
 * @param {string} formId - Form ID
 * @param {string} clientId - Client identifier
 * @param {number} cooldownMs - Cooldown duration in milliseconds
 */
async function setClientFormCooldown(formId, clientId, cooldownMs = DEFAULT_CLIENT_COOLDOWN_MS) {
  const key = `${formId}:${clientId}`;
  const redisClient = getRedisClient();
  if (redisClient) {
    const ttl = Math.max(0, Number.isFinite(cooldownMs) ? cooldownMs : DEFAULT_CLIENT_COOLDOWN_MS);
    if (ttl <= 0) {
      return;
    }
    await redisClient.set(`${COOLDOWN_PREFIX}:${key}`, '1', { NX: true, EX: toSeconds(ttl) });
    return;
  }

  clientFormCooldowns.set(key, Date.now() + cooldownMs);
}

/**
 * Generate a fingerprint for submission pattern detection
 * Creates a normalized hash that ignores minor variations in data
 * Uses clientId instead of just IP to distinguish users behind same IP
 * @param {string} formId - Form ID
 * @param {string} clientId - Client identifier
 * @param {object} data - Form submission data
 * @returns {string} - Fingerprint hash
 */
function generateSubmissionFingerprint(formId, clientId, data) {
  // Extract field names (structure) and approximate data length
  const fieldNames = Object.keys(data || {}).sort().join(',');
  const dataLengthBucket = Math.floor(JSON.stringify(data).length / 100) * 100; // Round to nearest 100
  const content = `${formId}:${clientId}:${fieldNames}:${dataLengthBucket}`;
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Check submission fingerprint for pattern-based rate limiting
 * @param {string} formId - Form ID
 * @param {string} clientId - Client identifier
 * @param {object} data - Form submission data
 * @returns {{ allowed: boolean, count: number }}
 */
function checkSubmissionFingerprint(formId, clientId, data) {
  const fingerprint = generateSubmissionFingerprint(formId, clientId, data);
  const now = Date.now();

  // Clean up old entries (run periodically)
  if (submissionFingerprints.size > 1000) {
    for (const [key, entry] of submissionFingerprints.entries()) {
      if (now - entry.firstSeen > FINGERPRINT_WINDOW_MS) {
        submissionFingerprints.delete(key);
      }
    }
  }

  const entry = submissionFingerprints.get(fingerprint);
  if (entry) {
    if (entry.count >= MAX_SUBMISSIONS_PER_FINGERPRINT) {
      return { allowed: false, count: entry.count };
    }
    entry.count += 1;
    return { allowed: true, count: entry.count };
  }

  // New fingerprint
  submissionFingerprints.set(fingerprint, { firstSeen: now, count: 1 });
  return { allowed: true, count: 1 };
}

/**
 * Enforce rate limiting for form submissions
 */
async function enforceRateLimit(tenantId, identifier = 'anonymous') {
  const key = `${tenantId}:${identifier}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  const redisClient = getRedisClient();
  if (redisClient) {
    const ttlSeconds = toSeconds(RATE_LIMIT_WINDOW_MS);
    const redisKey = `${RATE_LIMIT_PREFIX}:${key}`;
    const count = await redisClient.incr(redisKey);
    if (count === 1) {
      await redisClient.expire(redisKey, ttlSeconds);
    }
    if (count > RATE_LIMIT_MAX) {
      const ttl = await redisClient.ttl(redisKey);
      const retryAfter = ttl > 0 ? ttl : ttlSeconds;
      const error = new Error('Rate limit exceeded');
      error.code = 'RateLimitExceeded';
      error.statusCode = 429;
      error.retryAfter = retryAfter;
      throw error;
    }
    return;
  }

  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
    const error = new Error('Rate limit exceeded');
    error.code = 'RateLimitExceeded';
    error.statusCode = 429;
    error.retryAfter = retryAfter;
    throw error;
  }

  bucket.count += 1;
}

/**
 * Validate API key and extract tenant ID
 */
async function validateApiKey(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'ApiKeyRequired',
      message: 'API key is required. Provide it in Authorization header as "Bearer ctx_YOUR_KEY"'
    });
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Check if API key starts with ctx_ prefix
  if (!apiKey.startsWith('ctx_')) {
    return reply.code(401).send({
      error: 'InvalidApiKey',
      message: 'Invalid API key format. API key must start with ctx_ prefix'
    });
  }

  // Hash the API key
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Find API token in database
  const { ApiToken } = require('@contexthub/common');
  const apiToken = await ApiToken.findOne({ hash });

  if (!apiToken) {
    return reply.code(401).send({
      error: 'InvalidApiKey',
      message: 'API key not found or invalid'
    });
  }

  // Check if token is expired
  if (apiToken.expiresAt && new Date(apiToken.expiresAt) < new Date()) {
    return reply.code(401).send({
      error: 'ApiKeyExpired',
      message: 'API key has expired'
    });
  }

  const scopes = Array.isArray(apiToken.scopes) && apiToken.scopes.length
    ? apiToken.scopes
    : ['read'];

  // Check if token has write scope
  if (!scopes.includes('write')) {
    return reply.code(403).send({
      error: 'InsufficientPermissions',
      message: 'API key does not have write permission'
    });
  }

  // Update last used timestamp
  apiToken.lastUsedAt = new Date();
  await apiToken.save();

  // Set tenant ID from API token
  request.tenantId = apiToken.tenantId.toString();
  request.apiToken = apiToken;

  if (await checkRequestLimit(request, reply)) {
    return;
  }
}

/**
 * Public form routes
 */
async function publicFormRoutes(fastify) {
  // Apply tenant context to all routes (will be skipped if API key is used)
  fastify.addHook('preHandler', tenantContext);
  fastify.addHook('preHandler', checkRequestLimit);

  /**
   * GET /api/public/forms/:slug
   * Get form definition by slug (public access)
   */
  fastify.get('/public/forms/:slug', {
    schema: {
      tags: ['forms'],
      summary: 'Get public form by slug',
      description: 'Get a published form definition by slug. Provide either Authorization header with API token (preferred) or X-Tenant-ID header.',
      security: [{ apiToken: [] }, {}], // API token optional, can also use X-Tenant-ID
      params: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            description: 'Form slug (URL-friendly identifier)'
          }
        },
        required: ['slug']
      },
      response: {
        200: {
          description: 'Form definition with all field properties for rendering',
          type: 'object',
          properties: {
            form: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Form ID' },
                title: { type: 'object', description: 'Multilingual title' },
                description: { type: 'object', description: 'Multilingual description' },
                slug: { type: 'string', description: 'Form slug' },
                fields: {
                  type: 'array',
                  description: 'Form fields with complete rendering information',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', description: 'Field unique ID' },
                      type: { type: 'string', description: 'Field type (text, email, select, etc.)' },
                      name: { type: 'string', description: 'Field name for form submission' },
                      label: { type: 'object', description: 'Multilingual label' },
                      placeholder: { type: 'object', description: 'Multilingual placeholder' },
                      helpText: { type: 'object', description: 'Multilingual help text' },
                      required: { type: 'boolean', description: 'Is field required' },
                      validation: { type: 'object', description: 'Validation rules (min, max, pattern, etc.)' },
                      options: { type: 'array', description: 'Options for select/radio/checkbox fields' },
                      conditionalLogic: { type: 'object', description: 'Conditional display logic' },
                      defaultValue: { description: 'Default value' },
                      order: { type: 'number', description: 'Display order' },
                      width: { type: 'string', description: 'Field width (full, half, third, quarter)' },
                      className: { type: 'string', description: 'Custom CSS class' },
                      readOnly: { type: 'boolean', description: 'Is field read-only' },
                      disabled: { type: 'boolean', description: 'Is field disabled' },
                      hidden: { type: 'boolean', description: 'Is field hidden' }
                    }
                  }
                },
                settings: {
                  type: 'object',
                  properties: {
                    submitButtonText: { type: 'object', description: 'Multilingual submit button text' },
                    successMessage: { type: 'object', description: 'Multilingual success message' },
                    redirectUrl: { type: 'string', description: 'Redirect URL after submission' },
                    enableCaptcha: { type: 'boolean', description: 'Is CAPTCHA enabled' },
                    requireAuth: { type: 'boolean', description: 'Does form require authentication' }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Tenant ID or API key required',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          description: 'Form not found or not published',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check if API key is provided, if so validate it
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ctx_')) {
        // Validate API key and set tenant ID
        await validateApiKey(request, reply);

        // If validation failed, reply was already sent
        if (reply.sent) return;
      }

      // At this point, tenantId should be set either by API key or by tenantContext middleware
      if (!request.tenantId) {
        return reply.code(400).send({
          error: 'TenantIdRequired',
          message: 'Please provide either Authorization header with API key or X-Tenant-ID header'
        });
      }

      const form = await formService.getBySlug({
        tenantId: request.tenantId,
        slug: request.params.slug
      });

      // Only return published forms
      if (form.status !== 'published') {
        return reply.code(404).send({
          error: 'FormNotFound',
          message: 'Form not found'
        });
      }

      // Convert to plain object and remove internal fields
      const formObj = form.toObject ? form.toObject() : form;

      // Remove internal/sensitive fields
      delete formObj.createdBy;
      delete formObj.updatedBy;
      delete formObj.publishedBy;
      delete formObj.tenantId;
      delete formObj.createdAt;
      delete formObj.updatedAt;
      delete formObj.__v;
      delete formObj.lastVersionId;
      delete formObj.publishedAt;
      delete formObj.webhooks;
      delete formObj.submissionCount;
      delete formObj.version;
      if (formObj.settings) {
        delete formObj.settings.emailNotifications;
        delete formObj.settings.notificationEmails;
        delete formObj.settings.enableNotifications;
      }

      // Rename _id to id for consistency
      formObj.id = formObj._id;
      delete formObj._id;

      return reply.send({ form: formObj });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get public form');

      if (error.message === 'Form not found') {
        return reply.code(404).send({
          error: 'FormNotFound',
          message: 'Form not found'
        });
      }

      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to load form'
      });
    }
  });

  /**
   * POST /api/public/forms/:formId/submit
   * Submit a form response (requires API key)
   */
  fastify.post('/public/forms/:formId/submit', {
    schema: {
      tags: ['forms'],
      summary: 'Submit a public form',
      description: 'Submit a form response using API token authentication. Provide API token in Authorization header as "Bearer ctx_YOUR_KEY". Rate limited to 10 submissions per minute per IP.',
      security: [{ apiToken: [] }],
      params: {
        type: 'object',
        properties: {
          formId: {
            type: 'string',
            description: 'Form ID (ObjectId)'
          }
        },
        required: ['formId']
      },
      body: {
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            type: 'object',
            description: 'Form field data as key-value pairs (field names should match form definition)',
            additionalProperties: true
          }
        }
      },
      response: {
        201: {
          description: 'Form submitted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: {
              type: 'object',
              description: 'Success message in multiple languages'
            },
            responseId: {
              type: 'string',
              description: 'Created response ID'
            }
          }
        },
        400: {
          description: 'Validation error or invalid data',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        401: {
          description: 'API key missing or invalid',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          description: 'Form not found or not published',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        429: {
          description: 'Rate limit exceeded (10 submissions per minute)',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Validate API key first
      await validateApiKey(request, reply);

      // If validation failed, reply was already sent
      if (reply.sent) return;

      // Extract client identification signals
      const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
      const userAgent = request.headers['user-agent'] || '';
      const acceptLanguage = request.headers['accept-language'] || '';

      // Generate client identifier (combines IP + User-Agent + Language)
      // This helps distinguish different users behind the same IP (shared hosting, NAT, etc.)
      const clientId = generateClientId(ip, userAgent, acceptLanguage);

      // Check rate limiting (still IP-based for general abuse prevention)
      try {
        await enforceRateLimit(request.tenantId, ip);
      } catch (error) {
        request.log.warn({ err: error }, 'Form submission rate limit exceeded');
        return reply
          .code(error.statusCode || 429)
          .header('Retry-After', error.retryAfter || 60)
          .send({
            error: 'RateLimitExceeded',
            message: 'Too many submissions. Please try again later.'
          });
      }

      // Extract form data from request body
      const { data } = request.body;

      if (!data || typeof data !== 'object') {
        return reply.code(400).send({
          error: 'InvalidData',
          message: 'Form data is required and must be an object'
        });
      }

      // Check for duplicate submission (same data within 30 seconds)
      // Uses clientId to allow different users behind same IP
      if (await isDuplicateSubmission(request.params.formId, data, clientId)) {
        request.log.warn({ formId: request.params.formId, clientId }, 'Duplicate form submission detected');
        return reply.code(409).send({
          error: 'DuplicateSubmission',
          message: 'This form was already submitted. Please wait before submitting again.'
        });
      }

      // Check client-based cooldown (configurable per-form, default 1 minute)
      // Uses clientId instead of just IP to allow different users behind same IP
      const cooldownCheck = await checkClientFormCooldown(request.params.formId, clientId);
      if (!cooldownCheck.allowed) {
        const remainingSec = Math.ceil(cooldownCheck.remainingMs / 1000);
        request.log.warn({ formId: request.params.formId, clientId, remainingSec }, 'Client cooldown active');
        return reply
          .code(429)
          .header('Retry-After', remainingSec)
          .send({
            error: 'CooldownActive',
            message: `Please wait ${remainingSec} seconds before submitting again.`
          });
      }

      // Check submission fingerprint (pattern-based rate limiting)
      // Uses clientId to allow different users behind same IP
      const fingerprintCheck = checkSubmissionFingerprint(request.params.formId, clientId, data);
      if (!fingerprintCheck.allowed) {
        request.log.warn({ formId: request.params.formId, clientId, count: fingerprintCheck.count }, 'Fingerprint rate limit exceeded');
        return reply.code(429).send({
          error: 'TooManySubmissions',
          message: 'Too many similar submissions detected. Please try again later.'
        });
      }

      // Get form to check settings and for later use
      const form = await formService.getById({
        tenantId: request.tenantId,
        formId: request.params.formId
      });

      if (!form || form.status !== 'published') {
        return reply.code(404).send({
          error: 'FormNotFound',
          message: 'Form not found or not available'
        });
      }

      // Prepare metadata
      const metadata = {
        ip: ip,
        userAgent: request.headers['user-agent'],
        referrer: request.headers.referer || request.headers.referrer,
        source: 'api',
        locale: request.headers['accept-language']?.split(',')[0] || 'en'
      };

      // Submit response
      const response = await formService.submitResponse({
        tenantId: request.tenantId,
        formId: request.params.formId,
        data,
        metadata
      });

      // Set client cooldown after successful submission (use form-specific cooldown if configured)
      const formCooldownSeconds = form.settings?.submissionCooldownSeconds;
      const cooldownMs = (typeof formCooldownSeconds === 'number' && formCooldownSeconds >= 0)
        ? formCooldownSeconds * 1000
        : DEFAULT_CLIENT_COOLDOWN_MS;
      await setClientFormCooldown(request.params.formId, clientId, cooldownMs);

      return reply.code(201).send({
        success: true,
        message: form.settings?.successMessage || {
          en: 'Thank you for your submission!',
          tr: 'Gönderiminiz için teşekkürler!'
        },
        responseId: response._id
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to submit form response');

      if (error.message.includes('not found') || error.message.includes('not published')) {
        return reply.code(404).send({
          error: 'FormNotFound',
          message: 'Form not found or not available'
        });
      }

      if (error.message.includes('required')) {
        return reply.code(400).send({
          error: 'ValidationFailed',
          message: error.message
        });
      }

      return reply.code(500).send({
        error: 'SubmissionFailed',
        message: 'Failed to submit form response'
      });
    }
  });
}

module.exports = publicFormRoutes;
