const {
  tenantContext,
  authenticate,
  requireEditor,
  requireAdmin
} = require('../middleware/auth');
const formService = require('../services/formService');
const {
  createFormSchema,
  updateFormSchema,
  formListQuerySchema,
  validateSubmissionSafe
} = require('../services/formValidation');

/**
 * Form routes for admin panel
 */
async function formRoutes(fastify) {
  // Apply tenant context to all routes
  fastify.addHook('preHandler', tenantContext);

  /**
   * GET /api/forms
   * List all forms with filters
   */
  fastify.get('/forms', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          search: { type: 'string' },
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Validate query parameters
      const queryValidation = formListQuerySchema.safeParse(request.query);
      if (!queryValidation.success) {
        return reply.code(400).send({ 
          error: 'InvalidQuery', 
          message: 'Invalid query parameters',
          details: queryValidation.error.issues || []
        });
      }

      const { status, search, page, limit } = queryValidation.data;
      
      const result = await formService.list({
        tenantId: request.tenantId,
        filters: { status, search },
        pagination: { page, limit }
      });
      
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list forms');
      return reply.code(500).send({ 
        error: 'FormListFailed', 
        message: error.message 
      });
    }
  });

  /**
   * POST /api/forms
   * Create a new form
   */
  fastify.post('/forms', {
    preHandler: [authenticate, requireEditor],
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: ['string', 'object'] },
          slug: { type: 'string' },
          description: { type: ['string', 'object'] },
          fields: { type: 'array' },
          settings: { type: 'object', additionalProperties: true },
          visibility: { type: 'string', enum: ['public', 'authenticated'] }
        },
        required: ['title']
      }
    }
  }, async (request, reply) => {
    try {
      // Validate request body
      const validation = createFormSchema.safeParse(request.body);
      if (!validation.success) {
        // Zod error format: validation.error.issues (not .errors)
        const errorDetails = (validation.error.issues || []).map(err => ({
          path: err.path,
          message: err.message
        }));
        
        request.log.warn({ 
          validation_errors: errorDetails,
          body: request.body 
        }, 'Form validation failed');
        
        return reply.code(400).send({ 
          error: 'ValidationFailed', 
          message: 'Formda hata var. Lütfen aşağıdaki alanları kontrol edin.',
          details: errorDetails
        });
      }

      const form = await formService.create({
        tenantId: request.tenantId,
        data: validation.data,
        userId: request.user?._id?.toString()
      });

      return reply.code(201).send({ form });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create form');
      
      if (error.message.includes('already exists')) {
        return reply.code(409).send({ 
          error: 'SlugConflict', 
          message: error.message 
        });
      }
      
      return reply.code(400).send({ 
        error: 'FormCreateFailed', 
        message: error.message 
      });
    }
  });

  /**
   * GET /api/forms/:id
   * Get a single form by ID
   */
  fastify.get('/forms/:id', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const form = await formService.getById({
        tenantId: request.tenantId,
        formId: request.params.id,
        populateFields: true
      });

      return reply.send({ form });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get form');
      
      if (error.message === 'Form not found') {
        return reply.code(404).send({ 
          error: 'FormNotFound', 
          message: error.message 
        });
      }
      
      return reply.code(500).send({ 
        error: 'FormGetFailed', 
        message: error.message 
      });
    }
  });

  /**
   * PUT /api/forms/:id
   * Update a form
   */
  fastify.put('/forms/:id', {
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
          title: { type: ['string', 'object'] },
          slug: { type: 'string' },
          description: { type: ['string', 'object'] },
          fields: { type: 'array' },
          settings: { type: 'object', additionalProperties: true },
          visibility: { type: 'string', enum: ['public', 'authenticated'] },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Validate request body
      const validation = updateFormSchema.safeParse(request.body);
      if (!validation.success) {
        // Zod error format: validation.error.issues (not .errors)
        const errorDetails = (validation.error.issues || []).map(err => ({
          path: err.path,
          message: err.message
        }));
        
        request.log.warn({ 
          validation_errors: errorDetails,
          body: request.body 
        }, 'Form update validation failed');
        
        return reply.code(400).send({ 
          error: 'ValidationFailed', 
          message: 'Formda hata var. Lütfen aşağıdaki alanları kontrol edin.',
          details: errorDetails
        });
      }

      if (process.env.DEBUG_FORM_SETTINGS === 'true') {
        request.log.info({
          rawSettings: request.body?.settings,
          parsedSettings: validation.data?.settings
        }, 'Form settings debug');
      }

      const form = await formService.update({
        tenantId: request.tenantId,
        formId: request.params.id,
        data: validation.data,
        userId: request.user?._id?.toString()
      });

      return reply.send({ form });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update form');
      
      if (error.message === 'Form not found') {
        return reply.code(404).send({ 
          error: 'FormNotFound', 
          message: error.message 
        });
      }
      
      if (error.message.includes('already exists')) {
        return reply.code(409).send({ 
          error: 'SlugConflict', 
          message: error.message 
        });
      }
      
      return reply.code(400).send({ 
        error: 'FormUpdateFailed', 
        message: error.message 
      });
    }
  });

  /**
   * POST /api/forms/:id/publish
   * Publish a form
   */
  fastify.post('/forms/:id/publish', {
    preHandler: [authenticate, requireEditor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const form = await formService.publish({
        tenantId: request.tenantId,
        formId: request.params.id,
        userId: request.user?._id?.toString()
      });

      return reply.send({ form });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to publish form');
      
      if (error.message === 'Form not found') {
        return reply.code(404).send({ 
          error: 'FormNotFound', 
          message: error.message 
        });
      }
      
      return reply.code(400).send({ 
        error: 'FormPublishFailed', 
        message: error.message 
      });
    }
  });

  /**
   * POST /api/forms/:id/archive
   * Archive a form
   */
  fastify.post('/forms/:id/archive', {
    preHandler: [authenticate, requireEditor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const form = await formService.archive({
        tenantId: request.tenantId,
        formId: request.params.id,
        userId: request.user?._id?.toString()
      });

      return reply.send({ form });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to archive form');
      
      if (error.message === 'Form not found') {
        return reply.code(404).send({ 
          error: 'FormNotFound', 
          message: error.message 
        });
      }
      
      return reply.code(500).send({ 
        error: 'FormArchiveFailed', 
        message: error.message 
      });
    }
  });

  /**
   * DELETE /api/forms/:id
   * Delete a form (soft delete)
   */
  fastify.delete('/forms/:id', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const form = await formService.deleteForm({
        tenantId: request.tenantId,
        formId: request.params.id,
        userId: request.user?._id?.toString()
      });

      return reply.send({ 
        success: true,
        form 
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete form');
      
      if (error.message === 'Form not found') {
        return reply.code(404).send({ 
          error: 'FormNotFound', 
          message: error.message 
        });
      }
      
      return reply.code(500).send({ 
        error: 'FormDeleteFailed', 
        message: error.message 
      });
    }
  });

  /**
   * GET /api/forms/:id/versions
   * Get version history for a form
   */
  fastify.get('/forms/:id/versions', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query;
      
      const result = await formService.getVersionHistory({
        tenantId: request.tenantId,
        formId: request.params.id,
        pagination: { page, limit }
      });

      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get form versions');
      
      if (error.message === 'Form not found') {
        return reply.code(404).send({ 
          error: 'FormNotFound', 
          message: error.message 
        });
      }
      
      return reply.code(500).send({ 
        error: 'VersionListFailed', 
        message: error.message 
      });
    }
  });

  /**
   * POST /api/forms/:id/restore/:version
   * Restore a form from a specific version
   */
  fastify.post('/forms/:id/restore/:version', {
    preHandler: [authenticate, requireEditor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          version: { type: 'number', minimum: 1 }
        },
        required: ['id', 'version']
      }
    }
  }, async (request, reply) => {
    try {
      const form = await formService.restoreVersion({
        tenantId: request.tenantId,
        formId: request.params.id,
        version: parseInt(request.params.version),
        userId: request.user?._id?.toString()
      });

      return reply.send({ form });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to restore form version');
      
      if (error.message === 'Form not found' || error.message === 'Version not found') {
        return reply.code(404).send({ 
          error: 'NotFound', 
          message: error.message 
        });
      }
      
      return reply.code(400).send({ 
        error: 'VersionRestoreFailed', 
        message: error.message 
      });
    }
  });

  /**
   * POST /api/forms/:id/duplicate
   * Duplicate a form
   */
  fastify.post('/forms/:id/duplicate', {
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
          title: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const form = await formService.duplicate({
        tenantId: request.tenantId,
        formId: request.params.id,
        userId: request.user?._id?.toString(),
        newTitle: request.body?.title
      });

      return reply.code(201).send({ form });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to duplicate form');
      
      if (error.message === 'Form not found') {
        return reply.code(404).send({ 
          error: 'FormNotFound', 
          message: error.message 
        });
      }
      
      return reply.code(400).send({ 
        error: 'FormDuplicateFailed', 
        message: error.message 
      });
    }
  });

  /**
   * GET /api/forms/check-slug
   * Check if a slug is available
   */
  fastify.get('/forms/check-slug', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          formId: { type: 'string' }
        },
        required: ['slug']
      }
    }
  }, async (request, reply) => {
    try {
      const { slug, formId } = request.query;

      const available = !(await formService.ensureUniqueSlug({
        tenantId: request.tenantId,
        slug,
        excludeId: formId
      }).catch(() => false));

      return reply.send({ available });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to check slug');
      return reply.code(500).send({
        error: 'SlugCheckFailed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/forms/:id/responses
   * Get all responses for a form
   */
  fastify.get('/forms/:id/responses', {
    preHandler: [authenticate],
    schema: {
      tags: ['forms'],
      description: 'Get all form responses with filtering and pagination',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Form ID' }
        },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'processed', 'spam', 'deleted'],
            description: 'Filter by response status'
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter responses from this date'
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter responses until this date'
          },
          page: {
            type: 'number',
            minimum: 1,
            default: 1,
            description: 'Page number'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Items per page'
          }
        }
      },
      response: {
        200: {
          description: 'List of form responses with field metadata',
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  _id: { type: 'string' },
                  formId: { type: 'string' },
                  formVersion: { type: 'number' },
                  data: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'Form field data (field names as keys)'
                  },
                  status: { type: 'string', enum: ['pending', 'processed', 'spam', 'deleted'] },
                  source: { type: 'string' },
                  locale: { type: 'string' },
                  ip: { type: 'string', description: 'Hashed IP address' },
                  userAgent: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  fieldMetadata: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'Field metadata mapping (field name -> { id, type, label, options })'
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                pages: { type: 'number' }
              }
            },
            form: {
              type: 'object',
              additionalProperties: true,
              description: 'Form definition for reference',
              properties: {
                id: { type: 'string' },
                title: { type: 'object', additionalProperties: true, description: 'Multilingual form title' },
                fields: { type: 'array', description: 'Complete form field definitions' }
              }
            }
          }
        },
        404: {
          description: 'Form not found',
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
      const { status, startDate, endDate, page = 1, limit = 20 } = request.query;

      const result = await formService.getResponses({
        tenantId: request.tenantId,
        formId: request.params.id,
        filters: { status, startDate, endDate },
        pagination: { page, limit }
      });

      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get form responses');

      if (error.message === 'Form not found') {
        return reply.code(404).send({
          error: 'FormNotFound',
          message: error.message
        });
      }

      return reply.code(500).send({
        error: 'ResponseListFailed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/forms/:id/responses/:responseId
   * Get a single response by ID
   */
  fastify.get('/forms/:id/responses/:responseId', {
    preHandler: [authenticate],
    schema: {
      tags: ['forms'],
      description: 'Get detailed information about a specific form response',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Form ID' },
          responseId: { type: 'string', description: 'Response ID' }
        },
        required: ['id', 'responseId']
      },
      response: {
        200: {
          description: 'Form response details with field metadata',
          type: 'object',
          properties: {
            response: {
              type: 'object',
              additionalProperties: true,
              properties: {
                _id: { type: 'string' },
                tenantId: { type: 'string' },
                formId: { type: 'string' },
                formVersion: { type: 'number' },
                data: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Form field data (field names as keys)'
                },
                status: { type: 'string' },
                source: { type: 'string' },
                locale: { type: 'string' },
                userAgent: { type: 'string' },
                ip: { type: 'string', description: 'Hashed IP address' },
                geo: {
                  type: 'object',
                  nullable: true,
                  additionalProperties: true,
                  properties: {
                    country: { type: 'string' },
                    city: { type: 'string' }
                  }
                },
                device: {
                  type: 'object',
                  nullable: true,
                  additionalProperties: true,
                  properties: {
                    type: { type: 'string' },
                    os: { type: 'string' },
                    browser: { type: 'string' }
                  }
                },
                userId: { type: 'string', nullable: true },
                userEmail: { type: 'string', nullable: true },
                userName: { type: 'string', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                fieldMetadata: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Field metadata mapping (field name -> { id, type, label, placeholder, helpText, options, required })'
                },
                form: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Form definition for reference',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'object', additionalProperties: true, description: 'Multilingual form title' },
                    fields: { type: 'array', description: 'Complete form field definitions' }
                  }
                }
              }
            }
          }
        },
        404: {
          description: 'Response not found',
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
      const response = await formService.getResponseById({
        tenantId: request.tenantId,
        formId: request.params.id,
        responseId: request.params.responseId
      });

      return reply.send({ response });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get form response');

      if (error.message === 'Response not found') {
        return reply.code(404).send({
          error: 'ResponseNotFound',
          message: error.message
        });
      }

      return reply.code(500).send({
        error: 'ResponseGetFailed',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/forms/:id/responses/:responseId
   * Delete a response (soft delete)
   */
  fastify.delete('/forms/:id/responses/:responseId', {
    preHandler: [authenticate, requireEditor],
    schema: {
      tags: ['forms'],
      description: 'Delete a form response (soft delete, sets status to deleted)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Form ID' },
          responseId: { type: 'string', description: 'Response ID' }
        },
        required: ['id', 'responseId']
      },
      response: {
        200: {
          description: 'Response deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            response: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                status: { type: 'string', enum: ['deleted'] }
              }
            }
          }
        },
        404: {
          description: 'Response not found',
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
      const response = await formService.deleteResponse({
        tenantId: request.tenantId,
        formId: request.params.id,
        responseId: request.params.responseId
      });

      return reply.send({
        success: true,
        response
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete form response');

      if (error.message === 'Response not found') {
        return reply.code(404).send({
          error: 'ResponseNotFound',
          message: error.message
        });
      }

      return reply.code(500).send({
        error: 'ResponseDeleteFailed',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/forms/:id/responses/:responseId/permanent
   * Permanently delete a response (hard delete)
   */
  fastify.delete('/forms/:id/responses/:responseId/permanent', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      tags: ['forms'],
      description: 'Permanently delete a form response from database (hard delete, cannot be undone)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Form ID' },
          responseId: { type: 'string', description: 'Response ID' }
        },
        required: ['id', 'responseId']
      },
      response: {
        200: {
          description: 'Response permanently deleted',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            responseId: { type: 'string' }
          }
        },
        404: {
          description: 'Response not found',
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
      const result = await formService.hardDeleteResponse({
        tenantId: request.tenantId,
        formId: request.params.id,
        responseId: request.params.responseId
      });

      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to permanently delete form response');

      if (error.message === 'Response not found') {
        return reply.code(404).send({
          error: 'ResponseNotFound',
          message: error.message
        });
      }

      return reply.code(500).send({
        error: 'ResponseHardDeleteFailed',
        message: error.message
      });
    }
  });

  /**
   * PATCH /api/forms/:id/responses/:responseId/status
   * Update response status
   */
  fastify.patch('/forms/:id/responses/:responseId/status', {
    preHandler: [authenticate, requireEditor],
    schema: {
      tags: ['forms'],
      description: 'Update form response status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Form ID' },
          responseId: { type: 'string', description: 'Response ID' }
        },
        required: ['id', 'responseId']
      },
      body: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'processed', 'spam', 'deleted'],
            description: 'New status for the response'
          }
        },
        required: ['status']
      },
      response: {
        200: {
          description: 'Status updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            response: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'processed', 'spam', 'deleted'] },
                flaggedAsSpam: { type: 'boolean' }
              }
            }
          }
        },
        400: {
          description: 'Invalid status',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          description: 'Response not found',
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
      const response = await formService.updateResponseStatus({
        tenantId: request.tenantId,
        formId: request.params.id,
        responseId: request.params.responseId,
        status: request.body.status
      });

      return reply.send({
        success: true,
        response: {
          _id: response._id,
          status: response.status,
          flaggedAsSpam: response.flaggedAsSpam
        }
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update response status');

      if (error.message === 'Response not found') {
        return reply.code(404).send({
          error: 'ResponseNotFound',
          message: error.message
        });
      }

      if (error.message.includes('Invalid status')) {
        return reply.code(400).send({
          error: 'InvalidStatus',
          message: error.message
        });
      }

      return reply.code(500).send({
        error: 'StatusUpdateFailed',
        message: error.message
      });
    }
  });

  /**
   * POST /api/forms/:id/responses/:responseId/spam
   * Mark a response as spam
   */
  fastify.post('/forms/:id/responses/:responseId/spam', {
    preHandler: [authenticate, requireEditor],
    schema: {
      tags: ['forms'],
      description: 'Mark a form response as spam',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Form ID' },
          responseId: { type: 'string', description: 'Response ID' }
        },
        required: ['id', 'responseId']
      },
      response: {
        200: {
          description: 'Response marked as spam successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            response: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                status: { type: 'string', enum: ['spam'] },
                flaggedAsSpam: { type: 'boolean' }
              }
            }
          }
        },
        404: {
          description: 'Response not found',
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
      const response = await formService.markAsSpam({
        tenantId: request.tenantId,
        formId: request.params.id,
        responseId: request.params.responseId
      });

      return reply.send({
        success: true,
        response
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to mark response as spam');

      if (error.message === 'Response not found') {
        return reply.code(404).send({
          error: 'ResponseNotFound',
          message: error.message
        });
      }

      return reply.code(500).send({
        error: 'SpamMarkFailed',
        message: error.message
      });
    }
  });
}

module.exports = formRoutes;
