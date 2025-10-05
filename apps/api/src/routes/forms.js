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
          settings: { type: 'object' },
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
          settings: { type: 'object' },
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
}

module.exports = formRoutes;
