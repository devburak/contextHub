const {
  tenantContext,
  authenticate,
  requireAuthor,
} = require('../middleware/auth')
const mediaService = require('../services/mediaService')

async function mediaRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext)

  fastify.post('/media/presign', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      body: {
        type: 'object',
        properties: {
          fileName: { type: 'string' },
          contentType: { type: 'string' },
          size: { type: 'number' },
        },
        required: ['fileName', 'contentType'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            uploadUrl: { type: 'string' },
            key: { type: 'string' },
            fileName: { type: 'string' },
            folder: { type: 'string' },
            bucket: { type: 'string' },
            publicUrl: { type: 'string', nullable: true },
            extension: { type: 'string', nullable: true },
            maxUploadBytes: { type: 'number' },
          },
        },
      },
    },
  }, async function preSignHandler(request, reply) {
    try {
      const result = await mediaService.generatePresignedUpload({
        tenantId: request.tenantId,
        requestedName: request.body.fileName,
        contentType: request.body.contentType,
        size: request.body.size,
      })

      return reply.send(result)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate upload URL')
      return reply.code(400).send({
        error: 'PresignFailed',
        message: error.message,
      })
    }
  })

  fastify.post('/media', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      body: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          originalName: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'number' },
          altText: { type: 'string' },
          caption: { type: 'string' },
          description: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['key'],
      },
    },
  }, async function completeHandler(request, reply) {
    try {
      const media = await mediaService.completeUpload({
        tenantId: request.tenantId,
        userId: request.user?._id?.toString(),
        key: request.body.key,
        originalName: request.body.originalName,
        providedMimeType: request.body.mimeType,
        providedSize: request.body.size,
        altText: request.body.altText,
        caption: request.body.caption,
        description: request.body.description,
        tags: request.body.tags,
      })

      return reply.code(201).send({ media })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to register media upload')
      return reply.code(400).send({
        error: 'MediaPersistFailed',
        message: error.message,
      })
    }
  })

  fastify.get('/media', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          mimeType: { type: 'string' },
          tags: {
            anyOf: [
              { type: 'array', items: { type: 'string' } },
              { type: 'string' },
            ],
          },
          status: { type: 'string' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  }, async function listHandler(request, reply) {
    try {
      const tags = Array.isArray(request.query.tags)
        ? request.query.tags
        : request.query.tags
          ? String(request.query.tags).split(',')
          : []

      const result = await mediaService.listMedia({
        tenantId: request.tenantId,
        filters: {
          search: request.query.search,
          mimeType: request.query.mimeType,
          tags,
          status: request.query.status,
        },
        pagination: {
          page: request.query.page,
          limit: request.query.limit,
        },
      })

      return reply.send(result)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list media')
      return reply.code(400).send({
        error: 'MediaListFailed',
        message: error.message,
      })
    }
  })

  fastify.patch('/media/:id', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          originalName: { type: 'string' },
          altText: { type: 'string' },
          caption: { type: 'string' },
          description: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  }, async function updateHandler(request, reply) {
    try {
      const media = await mediaService.updateMediaMetadata({
        tenantId: request.tenantId,
        mediaId: request.params.id,
        payload: request.body || {},
        userId: request.user?._id?.toString(),
      })

      return reply.send({ media })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update media metadata')
      return reply.code(400).send({
        error: 'MediaUpdateFailed',
        message: error.message,
      })
    }
  })

  fastify.delete('/media/:id', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async function deleteHandler(request, reply) {
    try {
      const result = await mediaService.deleteMedia({
        tenantId: request.tenantId,
        mediaId: request.params.id,
      })

      if (!result.deleted) {
        return reply.code(404).send({ error: 'MediaNotFound', message: 'Media not found' })
      }

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete media item')
      return reply.code(400).send({
        error: 'MediaDeleteFailed',
        message: error.message,
      })
    }
  })

  fastify.post('/media/bulk/tags', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      body: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          mode: { type: 'string', enum: ['add', 'replace'] },
        },
        required: ['ids', 'tags'],
      },
    },
  }, async function bulkTagHandler(request, reply) {
    try {
      const result = await mediaService.bulkTagMedia({
        tenantId: request.tenantId,
        mediaIds: request.body.ids,
        tags: request.body.tags,
        mode: request.body.mode || 'add',
        userId: request.user?._id?.toString(),
      })

      return reply.send(result)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to apply bulk tags')
      return reply.code(400).send({
        error: 'MediaBulkTagFailed',
        message: error.message,
      })
    }
  })

  fastify.post('/media/bulk/delete', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      body: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
        required: ['ids'],
      },
    },
  }, async function bulkDeleteHandler(request, reply) {
    try {
      const result = await mediaService.bulkDeleteMedia({
        tenantId: request.tenantId,
        mediaIds: request.body.ids,
      })

      return reply.send(result)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete media items in bulk')
      return reply.code(400).send({
        error: 'MediaBulkDeleteFailed',
        message: error.message,
      })
    }
  })
}

module.exports = mediaRoutes
