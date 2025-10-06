const galleryService = require('../services/galleryService');
const { tenantContext, authenticate, requireEditor } = require('../middleware/auth');

async function galleryRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  fastify.get('/galleries', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          contentId: { type: 'string' },
          page: { type: 'number' },
          limit: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { search, contentId, page, limit } = request.query;
    const result = await galleryService.listGalleries({
      tenantId: request.tenantId,
      search,
      contentId,
      page,
      limit
    });
    return reply.send(result);
  });

  fastify.get('/galleries/:id', {
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
      const gallery = await galleryService.getGallery({
        tenantId: request.tenantId,
        galleryId: request.params.id
      });
      return reply.send({ gallery });
    } catch (error) {
      return reply.code(404).send({ error: 'GalleryNotFound', message: error.message });
    }
  });

  fastify.post('/galleries', {
    preHandler: [authenticate, requireEditor],
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mediaId: { type: 'string' },
                title: { type: 'string' },
                caption: { type: 'string' },
                order: { type: 'number' }
              },
              required: ['mediaId']
            }
          },
          linkedContentIds: {
            type: 'array',
            items: { type: 'string' }
          },
          status: { type: 'string' }
        },
        required: ['title']
      }
    }
  }, async (request, reply) => {
    try {
      const gallery = await galleryService.createGallery({
        tenantId: request.tenantId,
        userId: request.user?._id,
        payload: request.body
      });
      return reply.code(201).send({ gallery });
    } catch (error) {
      return reply.code(400).send({ error: 'GalleryCreateFailed', message: error.message });
    }
  });

  fastify.put('/galleries/:id', {
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
          title: { type: 'string' },
          description: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mediaId: { type: 'string' },
                title: { type: 'string' },
                caption: { type: 'string' },
                order: { type: 'number' }
              }
            }
          },
          linkedContentIds: {
            type: 'array',
            items: { type: 'string' }
          },
          status: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const gallery = await galleryService.updateGallery({
        tenantId: request.tenantId,
        galleryId: request.params.id,
        userId: request.user?._id,
        payload: request.body || {}
      });
      return reply.send({ gallery });
    } catch (error) {
      return reply.code(400).send({ error: 'GalleryUpdateFailed', message: error.message });
    }
  });

  fastify.delete('/galleries/:id', {
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
      await galleryService.deleteGallery({
        tenantId: request.tenantId,
        galleryId: request.params.id
      });
      return reply.send({ success: true });
    } catch (error) {
      return reply.code(400).send({ error: 'GalleryDeleteFailed', message: error.message });
    }
  });
}

module.exports = galleryRoutes;
