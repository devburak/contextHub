const {
  tenantContext,
  authenticate,
  requireEditor,
} = require('../middleware/auth')
const categoryService = require('../services/categoryService')

async function categoryRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext)

  fastify.get('/categories', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          flat: { type: ['boolean', 'string'] },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const flat = request.query.flat === true || request.query.flat === 'true'
      const data = await categoryService.listCategories({ tenantId: request.tenantId, flat })
      return reply.send({ categories: data })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list categories')
      return reply.code(400).send({ error: 'CategoryListFailed', message: error.message })
    }
  })

  fastify.post('/categories', {
    preHandler: [authenticate, requireEditor],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          parentId: { type: 'string', nullable: true },
          defaultSortField: { type: 'string' },
          defaultSortOrder: { type: 'string', enum: ['asc', 'desc'] },
          position: { type: 'number' },
          settings: { type: 'object', additionalProperties: true },
          metadata: { type: 'object', additionalProperties: true },
        },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    try {
      const category = await categoryService.createCategory({
        tenantId: request.tenantId,
        userId: request.user?._id?.toString(),
        payload: request.body,
      })
      return reply.code(201).send({ category })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create category')
      return reply.code(400).send({ error: 'CategoryCreateFailed', message: error.message })
    }
  })

  fastify.get('/categories/:id', {
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
      const category = await categoryService.getCategory({
        tenantId: request.tenantId,
        categoryId: request.params.id,
      })
      return reply.send({ category })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get category')
      return reply.code(404).send({ error: 'CategoryNotFound', message: error.message })
    }
  })

  fastify.put('/categories/:id', {
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
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          parentId: { type: 'string', nullable: true },
          defaultSortField: { type: 'string' },
          defaultSortOrder: { type: 'string', enum: ['asc', 'desc'] },
          position: { type: 'number' },
          settings: { type: 'object', additionalProperties: true },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const category = await categoryService.updateCategory({
        tenantId: request.tenantId,
        categoryId: request.params.id,
        userId: request.user?._id?.toString(),
        payload: request.body || {},
      })
      return reply.send({ category })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update category')
      return reply.code(400).send({ error: 'CategoryUpdateFailed', message: error.message })
    }
  })

  fastify.delete('/categories/:id', {
    preHandler: [authenticate, requireEditor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          cascade: { type: ['boolean', 'string'] },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const cascade = request.query.cascade === true || request.query.cascade === 'true' || request.query.cascade === undefined
      const result = await categoryService.deleteCategory({
        tenantId: request.tenantId,
        categoryId: request.params.id,
        cascade,
      })

      if (!result.deleted) {
        return reply.code(404).send({ error: 'CategoryNotFound', message: 'Category not found' })
      }

      return reply.send({ success: true, deleted: result.deleted })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete category')
      return reply.code(400).send({ error: 'CategoryDeleteFailed', message: error.message })
    }
  })
}

module.exports = categoryRoutes
