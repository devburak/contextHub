const {
  tenantContext,
  authenticate,
  requireEditor,
} = require('../middleware/auth')
const contentService = require('../services/contentService')
const tenantSettingsService = require('../services/tenantSettingsService')

async function contentRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext)

  fastify.get('/contents', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by content status (draft, published, scheduled, archived)' },
          search: { type: 'string', description: 'Search in title and summary fields' },
          category: { type: 'string', description: 'Filter by category ID (single)' },
          categories: { type: 'string', description: 'Filter by category IDs (comma-separated: id1,id2,id3)' },
          categoryName: { type: 'string', description: 'Search categories by name' },
          tag: { type: 'string', description: 'Filter by tag ID (single or comma-separated)' },
          tagName: { type: 'string', description: 'Search tags by name/title' },
          publishedFrom: { type: 'string', description: 'Filter contents published after or on this ISO date' },
          publishedTo: { type: 'string', description: 'Filter contents published before or on this ISO date' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          limit: { type: 'number', description: 'Items per page (default: 20, max: 100)' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { status, search, category, categories, categoryName, tag, tagName, publishedFrom, publishedTo, page, limit } = request.query
      const result = await contentService.listContents({
        tenantId: request.tenantId,
        filters: { status, search, category, categories, categoryName, tag, tagName, publishedFrom, publishedTo },
        pagination: { page, limit },
      })
      return reply.send(result)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list contents')
      return reply.code(400).send({ error: 'ContentListFailed', message: error.message })
    }
  })

  fastify.post('/contents', {
    preHandler: [authenticate, requireEditor],
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          slug: { type: 'string' },
          summary: { type: 'string' },
          lexical: { type: 'object' },
          html: { type: 'string' },
          categories: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          featuredMediaId: { type: 'string', nullable: true },
          status: { type: 'string' },
          publishAt: { type: ['string', 'null'] },
          authorName: { type: 'string' },
        },
        required: ['title'],
      },
    },
  }, async (request, reply) => {
    try {
      const settings = await tenantSettingsService.getSettings(request.tenantId)
      const featureFlags = settings.features || {}

      const content = await contentService.createContent({
        tenantId: request.tenantId,
        userId: request.user?._id?.toString(),
        payload: request.body,
        featureFlags,
      })
      return reply.code(201).send({ content })
    } catch (error) {
      if (error.code === contentService.CONTENT_SCHEDULING_DISABLED_CODE) {
        request.log.warn({ err: error }, 'Attempted to schedule content while feature disabled')
        return reply.code(403).send({ error: 'FeatureDisabled', message: error.message })
      }
      request.log.error({ err: error }, 'Failed to create content')
      return reply.code(400).send({ error: 'ContentCreateFailed', message: error.message })
    }
  })

  fastify.get('/contents/check-slug', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          contentId: { type: 'string', nullable: true },
        },
        required: ['slug'],
      },
    },
  }, async (request, reply) => {
    try {
      const result = await contentService.checkSlugAvailability({
        tenantId: request.tenantId,
        slug: request.query.slug,
        excludeId: request.query.contentId,
      })
      return reply.send(result)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to check slug availability')
      return reply.code(400).send({ error: 'ContentSlugCheckFailed', message: error.message })
    }
  })

  fastify.get('/contents/slug/:slug', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
        },
        required: ['slug'],
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Optional content status filter (single or comma-separated)' },
          publishedFrom: { type: 'string', description: 'Inclusive ISO timestamp to filter publishedAt' },
          publishedTo: { type: 'string', description: 'Inclusive ISO timestamp to filter publishedAt' }
        }
      }
    },
  }, async (request, reply) => {
    try {
      const content = await contentService.getContentBySlug({
        tenantId: request.tenantId,
        slug: request.params.slug,
        status: request.query?.status,
        publishedFrom: request.query?.publishedFrom,
        publishedTo: request.query?.publishedTo
      })
      return reply.send({ content })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch content by slug')
      return reply.code(404).send({ error: 'ContentNotFound', message: error.message })
    }
  })

  fastify.get('/contents/:id', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    try {
      const content = await contentService.getContent({
        tenantId: request.tenantId,
        contentId: request.params.id,
      })
      return reply.send({ content })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch content')
      return reply.code(404).send({ error: 'ContentNotFound', message: error.message })
    }
  })

  fastify.put('/contents/:id', {
    preHandler: [authenticate, requireEditor],
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
          title: { type: 'string' },
          slug: { type: 'string' },
          summary: { type: 'string' },
          lexical: { type: 'object' },
          html: { type: 'string' },
          categories: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          featuredMediaId: { type: 'string', nullable: true },
          status: { type: 'string' },
          publishAt: { type: ['string', 'null'] },
          authorName: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const settings = await tenantSettingsService.getSettings(request.tenantId)
      const featureFlags = settings.features || {}

      const content = await contentService.updateContent({
        tenantId: request.tenantId,
        contentId: request.params.id,
        userId: request.user?._id?.toString(),
        payload: request.body || {},
        featureFlags,
      })
      return reply.send({ content })
    } catch (error) {
      if (error.code === contentService.CONTENT_SCHEDULING_DISABLED_CODE) {
        request.log.warn({ err: error }, 'Attempted to schedule content while feature disabled')
        return reply.code(403).send({ error: 'FeatureDisabled', message: error.message })
      }
      request.log.error({ err: error }, 'Failed to update content')
      return reply.code(400).send({ error: 'ContentUpdateFailed', message: error.message })
    }
  })

  fastify.delete('/contents/:id', {
    preHandler: [authenticate, requireEditor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    try {
      const result = await contentService.deleteContent({
        tenantId: request.tenantId,
        contentId: request.params.id,
      })
      if (!result.deleted) {
        return reply.code(404).send({ error: 'ContentNotFound', message: 'Content not found' })
      }
      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete content')
      return reply.code(400).send({ error: 'ContentDeleteFailed', message: error.message })
    }
  })

  fastify.get('/contents/:id/versions', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    try {
      const versionsPayload = await contentService.listVersions({
        tenantId: request.tenantId,
        contentId: request.params.id,
      })
      return reply.send(versionsPayload)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list versions')
      return reply.code(400).send({ error: 'ContentVersionListFailed', message: error.message })
    }
  })

  fastify.post('/contents/:id/versions/delete', {
    preHandler: [authenticate, requireEditor],
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
          versionIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        required: ['versionIds'],
      },
    },
  }, async (request, reply) => {
    try {
      const result = await contentService.deleteVersions({
        tenantId: request.tenantId,
        contentId: request.params.id,
        versionIds: request.body.versionIds,
        user: request.user,
      })
      return reply.send({ success: true, ...result })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete content versions')
      return reply.code(400).send({ error: 'ContentVersionDeleteFailed', message: error.message })
    }
  })

  fastify.put('/contents/:id/galleries', {
    preHandler: [authenticate, requireEditor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          galleryIds: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['galleryIds']
      }
    }
  }, async (request, reply) => {
    try {
      const galleries = await contentService.setContentGalleries({
        tenantId: request.tenantId,
        contentId: request.params.id,
        galleryIds: request.body.galleryIds
      })
      return reply.send({ galleries })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update content galleries')
      return reply.code(400).send({ error: 'ContentGalleryUpdateFailed', message: error.message })
    }
  })
}

module.exports = contentRoutes
