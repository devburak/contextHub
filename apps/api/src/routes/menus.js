const menuService = require('../services/menuService');
const { tenantContext, authenticate } = require('../middleware/auth');

/**
 * Menu Routes - WordPress benzeri menu yönetimi
 *
 * Admin Routes:
 * - GET    /api/menus                  - List all menus
 * - GET    /api/menus/:id              - Get menu details
 * - GET    /api/menus/:id/tree         - Get menu as tree structure
 * - POST   /api/menus                  - Create new menu
 * - PUT    /api/menus/:id              - Update menu
 * - DELETE /api/menus/:id              - Delete menu
 * - POST   /api/menus/:id/duplicate    - Duplicate menu
 * - POST   /api/menus/:id/items        - Add menu item
 * - PUT    /api/menus/:id/items/:itemId - Update menu item
 * - DELETE /api/menus/:id/items/:itemId - Delete menu item
 * - POST   /api/menus/:id/reorder      - Reorder menu items
 * - POST   /api/menus/:id/items/:itemId/move - Move menu item
 * - GET    /api/menus/stats            - Get menu statistics
 *
 * Public Routes:
 * - GET    /api/public/menus/location/:location - Get menu by location
 * - GET    /api/public/menus/slug/:slug - Get menu by slug
 */

module.exports = async function(fastify, opts) {
  
  // ==================== ADMIN ROUTES ====================
  
  /**
   * List all menus
   */
  fastify.get('/menus', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const filters = {
        status: request.query.status,
        location: request.query.location,
        search: request.query.search
      };

      const menus = await menuService.listMenus(request.tenantId, filters);

      reply.send({
        success: true,
        menus,
        total: menus.length
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Get menu details
   */
  fastify.get('/menus/:id', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const menu = await menuService.getMenu(request.tenantId, id);

      reply.send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Menu not found') {
        return reply.code(404).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Get menu as tree structure
   */
  fastify.get('/menus/:id/tree', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const tree = await menuService.getMenuTree(request.tenantId, id);

      reply.send({
        success: true,
        tree
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Create new menu
   */
  fastify.post('/menus', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const userId = request.user?.id;

      const menu = await menuService.createMenu(request.tenantId, request.body, userId);

      reply.code(201).send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Menu slug already exists') {
        return reply.code(409).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Update menu
   */
  fastify.put('/menus/:id', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const userId = request.user?.id;

      const menu = await menuService.updateMenu(request.tenantId, id, request.body, userId);

      reply.send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Menu not found') {
        return reply.code(404).send({ error: error.message });
      }

      if (error.message === 'Menu slug already exists') {
        return reply.code(409).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Delete menu
   */
  fastify.delete('/menus/:id', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const userId = request.user?._id?.toString() || request.user?.id || null;

      await menuService.deleteMenu(request.tenantId, id, userId);

      reply.send({
        success: true,
        message: 'Menu deleted successfully'
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Menu not found') {
        return reply.code(404).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Duplicate menu
   */
  fastify.post('/menus/:id/duplicate', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { name } = request.body;
      const userId = request.user?.id;

      if (!name) {
        return reply.code(400).send({ error: 'Name required' });
      }

      const menu = await menuService.duplicateMenu(request.tenantId, id, name, userId);

      reply.code(201).send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: error.message });
    }
  });
  
  // ==================== MENU ITEMS ====================
  
  /**
   * Add menu item
   */
  fastify.post('/menus/:id/items', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const menu = await menuService.addMenuItem(request.tenantId, id, request.body);

      reply.code(201).send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Parent menu item not found') {
        return reply.code(404).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Update menu item
   */
  fastify.put('/menus/:id/items/:itemId', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id, itemId } = request.params;

      const menu = await menuService.updateMenuItem(request.tenantId, id, itemId, request.body);

      reply.send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Menu item not found') {
        return reply.code(404).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Delete menu item
   */
  fastify.delete('/menus/:id/items/:itemId', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id, itemId } = request.params;

      const menu = await menuService.deleteMenuItem(request.tenantId, id, itemId);

      reply.send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Reorder menu items
   */
  fastify.post('/menus/:id/reorder', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { items } = request.body; // [{ id, order, parentId }]

      if (!items || !Array.isArray(items)) {
        return reply.code(400).send({ error: 'Items array required' });
      }

      const menu = await menuService.reorderMenuItems(request.tenantId, id, items);

      reply.send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Some menu items not found') {
        return reply.code(404).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Move menu item
   */
  fastify.post('/menus/:id/items/:itemId/move', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const { id, itemId } = request.params;
      const { parentId, order } = request.body;

      const menu = await menuService.moveMenuItem(request.tenantId, id, itemId, parentId, order);

      reply.send({
        success: true,
        ...menu.toObject()
      });
    } catch (error) {
      request.log.error(error);

      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message });
      }

      if (error.message === 'Cannot move item to its own child') {
        return reply.code(400).send({ error: error.message });
      }

      reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Get menu statistics
   */
  fastify.get('/menus/stats', {
    preHandler: [tenantContext, authenticate]
  }, async (request, reply) => {
    try {
      const stats = await menuService.getMenuStats(request.tenantId);

      reply.send({
        success: true,
        stats
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: error.message });
    }
  });
  
  // ==================== PUBLIC ROUTES ====================
  
  /**
   * Get menu by location (public)
   */
  fastify.get('/public/menus/location/:location', {
    preHandler: [tenantContext]
  }, async (request, reply) => {
    try {
      const { location } = request.params;

      const menu = await menuService.getMenuByLocation(request.tenantId, location);

      if (!menu) {
        return reply.code(404).send({ error: 'Menu not found' });
      }

      reply.send({
        success: true,
        ...menu
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get menu by slug (public)
   */
  fastify.get('/public/menus/slug/:slug', {
    preHandler: [tenantContext]
  }, async (request, reply) => {
    try {
      const { slug } = request.params;

      const menu = await menuService.getMenuBySlug(request.tenantId, slug);

      if (!menu) {
        return reply.code(404).send({ error: 'Menu not found' });
      }

      reply.send({
        success: true,
        ...menu
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: error.message });
    }
  });
};
