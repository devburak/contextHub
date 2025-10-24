const { tenantContext } = require('../middleware/auth');
const formService = require('../services/formService');
const crypto = require('crypto');

/**
 * Rate limiting configuration for form submissions
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // Max 10 submissions per minute per IP
const rateLimitBuckets = new Map();

/**
 * Enforce rate limiting for form submissions
 */
function enforceRateLimit(tenantId, identifier = 'anonymous') {
  const key = `${tenantId}:${identifier}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

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

  // Check if token has write scope
  if (apiToken.scopes && !apiToken.scopes.includes('write')) {
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
}

/**
 * Public form routes
 */
async function publicFormRoutes(fastify) {
  // Apply tenant context to all routes (will be skipped if API key is used)
  fastify.addHook('preHandler', tenantContext);

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

      // Check rate limiting
      const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
      try {
        enforceRateLimit(request.tenantId, ip);
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

      // Get form for success message
      const form = await formService.getById({
        tenantId: request.tenantId,
        formId: request.params.formId
      });

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
