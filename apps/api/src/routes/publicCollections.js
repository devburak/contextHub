const {
  tenantContext
} = require('../middleware/auth');
const {
  listEntries,
  findEntryBySlug,
  runCollectionQuery
} = require('../services/collectionEntryService');
const {
  getCollectionType
} = require('../services/collectionTypeService');
const {
  entryListQuerySchema,
  collectionQuerySchema
} = require('../services/collectionValidation');

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const cacheStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitBuckets = new Map();

function buildCacheKey(parts = []) {
  return parts.join(':');
}

function getFromCache(key) {
  const cached = cacheStore.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    cacheStore.delete(key);
    return null;
  }
  return cached.value;
}

function setCache(key, value, ttl = DEFAULT_CACHE_TTL_MS) {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });
}

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

function serialiseId(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value.toString) return value.toString();
  return value;
}

function sanitiseRelations(relations = {}) {
  return {
    contents: (relations.contents || []).map(serialiseId),
    media: (relations.media || []).map(serialiseId),
    refs: (relations.refs || []).map((ref) => ({
      collectionKey: ref.collectionKey,
      entryId: serialiseId(ref.entryId),
      relationType: ref.relationType
    }))
  };
}

function sanitiseEntry(entry) {
  if (!entry) return null;
  return {
    id: serialiseId(entry._id),
    collectionKey: entry.collectionKey,
    slug: entry.slug,
    status: entry.status,
    data: entry.data,
    relations: sanitiseRelations(entry.relations),
    indexed: entry.indexed,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

async function publicCollectionRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  fastify.get('/public/collections/:key', async (request, reply) => {
    const validation = entryListQuerySchema.safeParse(request.query);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'ValidationFailed',
        message: 'Invalid query parameters',
        details: validation.error.issues
      });
    }

    const query = {
      ...validation.data,
      status: 'published'
    };

    const cacheKey = buildCacheKey([
      request.tenantId,
      request.params.key,
      JSON.stringify(query)
    ]);

    const cached = getFromCache(cacheKey);
    if (cached) {
      return reply.send(cached);
    }

    try {
      // Ensure collection exists, mainly to trigger 404 when key is wrong
      await getCollectionType({ tenantId: request.tenantId, key: request.params.key });

      const result = await listEntries({
        tenantId: request.tenantId,
        collectionKey: request.params.key,
        query
      });

      const response = {
        items: (result.items || []).map(sanitiseEntry),
        pagination: result.pagination
      };

      setCache(cacheKey, response);
      return reply.send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch public entries');
      if (error.code === 'CollectionTypeNotFound') {
        return reply.code(404).send({ error: error.code, message: error.message });
      }
      return reply.code(500).send({ error: 'InternalServerError', message: error.message });
    }
  });

  fastify.get('/public/collections/:key/:slug', async (request, reply) => {
    const cacheKey = buildCacheKey([
      request.tenantId,
      request.params.key,
      request.params.slug
    ]);

    const cached = getFromCache(cacheKey);
    if (cached) {
      return reply.send(cached);
    }

    try {
      await getCollectionType({ tenantId: request.tenantId, key: request.params.key });
      const entry = await findEntryBySlug({
        tenantId: request.tenantId,
        collectionKey: request.params.key,
        slug: request.params.slug,
        status: 'published'
      });

      if (!entry) {
        return reply.code(404).send({ error: 'EntryNotFound', message: 'Entry not found' });
      }

      const response = { entry: sanitiseEntry(entry) };
      setCache(cacheKey, response);
      return reply.send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch public entry');
      if (error.code === 'CollectionTypeNotFound') {
        return reply.code(404).send({ error: error.code, message: error.message });
      }
      return reply.code(500).send({ error: 'InternalServerError', message: error.message });
    }
  });

  fastify.post('/public/queries/run', async (request, reply) => {
    try {
      enforceRateLimit(request.tenantId, request.ip || request.headers['x-forwarded-for'] || 'unknown');
    } catch (error) {
      request.log.warn({ err: error }, 'Public query rate limit exceeded');
      return reply
        .code(error.statusCode || 429)
        .header('Retry-After', error.retryAfter || 60)
        .send({ error: 'RateLimitExceeded', message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' });
    }

    const validation = collectionQuerySchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'ValidationFailed',
        message: 'Geçersiz sorgu isteği',
        details: validation.error.issues
      });
    }

    const payload = validation.data;

    const cacheKey = buildCacheKey([
      'dsl',
      request.tenantId,
      JSON.stringify(payload)
    ]);

    const cached = getFromCache(cacheKey);
    if (cached) {
      return reply.send(cached);
    }

    try {
      const result = await runCollectionQuery({
        tenantId: request.tenantId,
        payload
      });

      setCache(cacheKey, result, DEFAULT_CACHE_TTL_MS);
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to run collection query');
      if (error.code === 'CollectionTypeNotFound') {
        return reply.code(404).send({ error: error.code, message: error.message });
      }
      const status = error.statusCode || 400;
      return reply.code(status).send({
        error: error.code || 'QueryFailed',
        message: error.message || 'Sorgu yürütülemedi'
      });
    }
  });
}

module.exports = publicCollectionRoutes;
