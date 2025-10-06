const {
  tenantContext,
  authenticate,
  requireEditor
} = require('../middleware/auth');
const {
  listCollectionTypes,
  createCollectionType,
  updateCollectionType
} = require('../services/collectionTypeService');
const {
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry
} = require('../services/collectionEntryService');
const {
  createCollectionSchema,
  updateCollectionSchema,
  entryPayloadSchema,
  entryListQuerySchema
} = require('../services/collectionValidation');

function parseValidationError(validation) {
  return (validation.error?.issues || []).map((issue) => ({
    path: issue.path,
    message: issue.message
  }));
}

function handleServiceError(reply, error) {
  switch (error.code) {
    case 'DuplicateCollectionKey':
      return reply.code(409).send({ error: error.code, message: error.message });
    case 'DuplicateFieldKey':
    case 'EntryValidationFailed':
    case 'UniqueFieldViolation':
    case 'InvalidEntryId':
      return reply.code(400).send({
        error: error.code || 'ValidationFailed',
        message: error.message,
        details: error.details
      });
    case 'CollectionTypeNotFound':
    case 'EntryNotFound':
      return reply.code(404).send({ error: error.code, message: error.message });
    default:
      return reply.code(500).send({ error: 'InternalServerError', message: error.message });
  }
}

async function collectionRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  fastify.get('/collections', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'archived'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const collections = await listCollectionTypes({
        tenantId: request.tenantId,
        status: request.query.status
      });
      return reply.send({ collections });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list collection types');
      return handleServiceError(reply, error);
    }
  });

  fastify.post('/collections', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    const validation = createCollectionSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'ValidationFailed',
        message: 'Invalid collection definition',
        details: parseValidationError(validation)
      });
    }

    try {
      const created = await createCollectionType({
        tenantId: request.tenantId,
        payload: validation.data,
        userId: request.user?._id?.toString()
      });
      return reply.code(201).send({ collection: created });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create collection type');
      return handleServiceError(reply, error);
    }
  });

  fastify.put('/collections/:key', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    const validation = updateCollectionSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'ValidationFailed',
        message: 'Invalid collection definition',
        details: parseValidationError(validation)
      });
    }

    try {
      const updated = await updateCollectionType({
        tenantId: request.tenantId,
        key: request.params.key,
        payload: validation.data,
        userId: request.user?._id?.toString()
      });
      return reply.send({ collection: updated });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update collection type');
      return handleServiceError(reply, error);
    }
  });

  fastify.get('/collections/:key/entries', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          q: { type: 'string' },
          sort: { type: 'string' },
          filter: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    const validation = entryListQuerySchema.safeParse(request.query);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'ValidationFailed',
        message: 'Invalid query parameters',
        details: parseValidationError(validation)
      });
    }

    try {
      const result = await listEntries({
        tenantId: request.tenantId,
        collectionKey: request.params.key,
        query: validation.data
      });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list collection entries');
      return handleServiceError(reply, error);
    }
  });

  fastify.post('/collections/:key/entries', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    const validation = entryPayloadSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'ValidationFailed',
        message: 'Invalid entry payload',
        details: parseValidationError(validation)
      });
    }

    try {
      const entry = await createEntry({
        tenantId: request.tenantId,
        collectionKey: request.params.key,
        payload: validation.data,
        userId: request.user?._id?.toString()
      });
      return reply.code(201).send({ entry });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create collection entry');
      return handleServiceError(reply, error);
    }
  });

  fastify.put('/collections/:key/entries/:id', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    const validation = entryPayloadSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'ValidationFailed',
        message: 'Invalid entry payload',
        details: parseValidationError(validation)
      });
    }

    try {
      const entry = await updateEntry({
        tenantId: request.tenantId,
        collectionKey: request.params.key,
        entryId: request.params.id,
        payload: validation.data,
        userId: request.user?._id?.toString()
      });
      return reply.send({ entry });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update collection entry');
      return handleServiceError(reply, error);
    }
  });

  fastify.delete('/collections/:key/entries/:id', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      await deleteEntry({
        tenantId: request.tenantId,
        collectionKey: request.params.key,
        entryId: request.params.id
      });
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete collection entry');
      return handleServiceError(reply, error);
    }
  });
}

module.exports = collectionRoutes;
