const {
  tenantContext,
  authenticate,
  requireAuthor,
} = require('../middleware/auth')
const tagService = require('../services/tagService')

async function tagRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext)

  fastify.get('/tags', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          page: { type: ['number', 'string'] },
          limit: { type: ['number', 'string'] },
          ids: {
            anyOf: [
              { type: 'array', items: { type: 'string' } },
              { type: 'string' },
            ],
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { search } = request.query
      const limit = request.query.limit !== undefined ? Number(request.query.limit) : undefined
      const page = request.query.page !== undefined ? Number(request.query.page) : undefined
      const idsValue = request.query.ids
      const ids = Array.isArray(idsValue)
        ? idsValue
        : typeof idsValue === 'string'
          ? idsValue.split(',').map((item) => item.trim()).filter(Boolean)
          : undefined

      const result = await tagService.listTags({
        tenantId: request.tenantId,
        search,
        limit,
        page,
        ids,
      })

      return reply.send(result)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list tags')
      return reply.code(400).send({ error: 'TagListFailed', message: error.message })
    }
  })

  fastify.post('/tags', {
    preHandler: [authenticate, requireAuthor],
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      },
    },
  }, async (request, reply) => {
    try {
      const tag = await tagService.findOrCreateTag({
        tenantId: request.tenantId,
        title: request.body.title,
        userId: request.user?._id?.toString(),
      })

      return reply.code(201).send({ tag })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create tag')
      return reply.code(400).send({ error: 'TagCreateFailed', message: error.message })
    }
  })
}

module.exports = tagRoutes
