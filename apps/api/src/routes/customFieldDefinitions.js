const {
  tenantContext,
  authenticate,
  requireEditor,
} = require('../middleware/auth')
const customFieldDefinitionService = require('../services/customFieldDefinitionService')

async function customFieldDefinitionRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext)

  fastify.get('/custom-field-definitions', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const definitions = await customFieldDefinitionService.listDefinitions({
        tenantId: request.tenantId,
        publicOnly: request.query?.public === 'true' || request.authType === 'api_token'
      })
      return reply.send({ definitions })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list custom field definitions')
      return reply.code(400).send({ error: 'CustomFieldDefinitionListFailed', message: error.message })
    }
  })

  fastify.post('/custom-field-definitions', {
    preHandler: [authenticate, requireEditor],
  }, async (request, reply) => {
    try {
      const definition = await customFieldDefinitionService.createDefinition({
        tenantId: request.tenantId,
        userId: request.user?._id?.toString(),
        payload: request.body || {}
      })
      return reply.code(201).send({ definition })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create custom field definition')
      return reply.code(400).send({ error: 'CustomFieldDefinitionCreateFailed', message: error.message })
    }
  })

  fastify.put('/custom-field-definitions/:id', {
    preHandler: [authenticate, requireEditor],
  }, async (request, reply) => {
    try {
      const definition = await customFieldDefinitionService.updateDefinition({
        tenantId: request.tenantId,
        definitionId: request.params.id,
        userId: request.user?._id?.toString(),
        payload: request.body || {}
      })
      return reply.send({ definition })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update custom field definition')
      return reply.code(400).send({ error: 'CustomFieldDefinitionUpdateFailed', message: error.message })
    }
  })

  fastify.delete('/custom-field-definitions/:id', {
    preHandler: [authenticate, requireEditor],
  }, async (request, reply) => {
    try {
      const result = await customFieldDefinitionService.deleteDefinition({
        tenantId: request.tenantId,
        definitionId: request.params.id
      })
      if (!result.deleted) {
        return reply.code(404).send({ error: 'CustomFieldDefinitionNotFound', message: 'Custom field definition not found' })
      }
      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete custom field definition')
      return reply.code(400).send({ error: 'CustomFieldDefinitionDeleteFailed', message: error.message })
    }
  })
}

module.exports = customFieldDefinitionRoutes
