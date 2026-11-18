const { tenantContext } = require('../middleware/auth');
const { checkRequestLimit } = require('../middleware/requestLimitGuard');
const formService = require('../services/formService');
const formUploadService = require('../services/formUploadService');
const localRedisClient = require('../lib/localRedis');
const { extractTrustedClientIp } = require('../services/clientIp');
const { validateApiKey } = require('./publicForms');

/**
 * Upload endpoints are rate limited per tenant and client IP, separately from
 * form submissions so a busy uploader does not use up the submission allowance.
 */
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMITS = Object.freeze({
  session: 10, // each one costs a Turnstile verification
  upload: 60
});
const RATE_LIMIT_PREFIX = 'form:upload:ratelimit';
const rateLimitBuckets = new Map();

const KNOWN_ERRORS = new Set(['FormUploadError', 'FormUploadSessionError', 'FormUploadPolicyError']);

async function isRateLimited(scope, tenantId, ip) {
  const max = RATE_LIMITS[scope];
  const key = `${scope}:${tenantId}:${ip || 'unknown'}`;

  if (localRedisClient.isEnabled()) {
    const client = localRedisClient.getClient();
    const redisKey = `${RATE_LIMIT_PREFIX}:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    return count > max;
  }

  const now = Date.now();
  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
      if (bucket.resetAt < now) rateLimitBuckets.delete(bucketKey);
    }
  }
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

function getSessionToken(request) {
  return request.headers['x-upload-session'] || request.body?.uploadSession;
}

function sendError(request, reply, error) {
  if (KNOWN_ERRORS.has(error?.name)) {
    return reply.code(error.statusCode || 400).send({
      error: error.code,
      message: error.message,
      details: error.details
    });
  }
  request.log.error({ err: error }, 'Form upload request failed');
  return reply.code(500).send({
    error: 'FormUploadFailed',
    message: 'Failed to process the upload request'
  });
}

/**
 * Authenticate the API key, apply the rate limit and load the published form.
 * Returns null when a reply has already been sent.
 */
async function prepare(request, reply, scope) {
  await validateApiKey(request, reply);
  if (reply.sent) return null;

  const ip = extractTrustedClientIp(request);
  if (await isRateLimited(scope, request.tenantId, ip)) {
    reply
      .code(429)
      .header('Retry-After', RATE_LIMIT_WINDOW_SECONDS)
      .send({ error: 'RateLimitExceeded', message: 'Too many upload requests. Please try again later.' });
    return null;
  }

  let form = null;
  try {
    form = await formService.getById({ tenantId: request.tenantId, formId: request.params.formId });
  } catch (error) {
    form = null;
  }
  if (!form || form.status !== 'published') {
    reply.code(404).send({ error: 'FormNotFound', message: 'Form not found or not available' });
    return null;
  }

  return { form, ip };
}

const formParams = {
  type: 'object',
  properties: { formId: { type: 'string', description: 'Form ID (ObjectId)' } },
  required: ['formId']
};

const uploadParams = {
  type: 'object',
  properties: {
    formId: { type: 'string', description: 'Form ID (ObjectId)' },
    uploadId: { type: 'string', description: 'Upload ID returned by the presign call' }
  },
  required: ['formId', 'uploadId']
};

/**
 * Public form upload routes. Like form submission, they require a write-scoped
 * API token and are meant to be called through the site's own backend.
 */
async function publicFormUploadRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);
  fastify.addHook('preHandler', checkRequestLimit);

  fastify.post('/public/forms/:formId/uploads/session', {
    schema: {
      tags: ['forms'],
      summary: 'Start a form upload session',
      description: 'Verifies a Cloudflare Turnstile token and returns a short-lived upload session for this form. The session is required by the presign, complete and submit calls.',
      security: [{ apiToken: [] }],
      params: formParams,
      body: {
        type: 'object',
        required: ['turnstileToken'],
        properties: {
          turnstileToken: { type: 'string', description: 'Token produced by the Turnstile widget' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const context = await prepare(request, reply, 'session');
      if (!context) return reply;

      const session = await formUploadService.createSession({
        tenantId: request.tenantId,
        form: context.form,
        turnstileToken: request.body.turnstileToken,
        ip: context.ip
      });
      return reply.code(201).send(session);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/public/forms/:formId/uploads/presign', {
    schema: {
      tags: ['forms'],
      summary: 'Get a presigned upload link for a form file',
      description: 'Returns a presigned PUT link (valid for 5 minutes) to the private bucket. Send the file with exactly the returned headers, then call the complete endpoint.',
      security: [{ apiToken: [] }],
      params: formParams,
      body: {
        type: 'object',
        required: ['field', 'filename', 'size'],
        properties: {
          uploadSession: { type: 'string', description: 'Upload session token (or send it as X-Upload-Session)' },
          field: { type: 'string', description: 'Name of the file field' },
          filename: { type: 'string', maxLength: 255 },
          size: { type: 'integer', minimum: 1, description: 'File size in bytes' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const context = await prepare(request, reply, 'upload');
      if (!context) return reply;

      const result = await formUploadService.presignUpload({
        tenantId: request.tenantId,
        form: context.form,
        sessionToken: getSessionToken(request),
        fieldName: request.body.field,
        filename: request.body.filename,
        size: request.body.size,
        ip: context.ip
      });
      return reply.code(201).send(result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/public/forms/:formId/uploads/:uploadId/complete', {
    schema: {
      tags: ['forms'],
      summary: 'Confirm an uploaded form file',
      description: 'Verifies the size and content of the uploaded object. Only completed uploads can be referenced in a form submission.',
      security: [{ apiToken: [] }],
      params: uploadParams,
      body: {
        type: 'object',
        nullable: true,
        properties: {
          uploadSession: { type: 'string', description: 'Upload session token (or send it as X-Upload-Session)' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const context = await prepare(request, reply, 'upload');
      if (!context) return reply;

      const upload = await formUploadService.completeUpload({
        tenantId: request.tenantId,
        form: context.form,
        sessionToken: getSessionToken(request),
        uploadId: request.params.uploadId
      });
      return reply.send({ upload });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.delete('/public/forms/:formId/uploads/:uploadId', {
    schema: {
      tags: ['forms'],
      summary: 'Remove an uploaded form file before submission',
      description: 'Discards a pending or completed upload. Send the upload session as the X-Upload-Session header.',
      security: [{ apiToken: [] }],
      params: uploadParams
    }
  }, async (request, reply) => {
    try {
      const context = await prepare(request, reply, 'upload');
      if (!context) return reply;

      const result = await formUploadService.discardUpload({
        tenantId: request.tenantId,
        form: context.form,
        sessionToken: getSessionToken(request),
        uploadId: request.params.uploadId
      });
      return reply.send(result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}

module.exports = publicFormUploadRoutes;
