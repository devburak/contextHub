const menuService = require('../services/menuService');

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
  fastify.get('/menus', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const filters = {
        status: request.query.status,
        location: request.query.location,
        search: request.query.search
      };
      
      const menus = await menuService.listMenus(tenantId, filters);
      
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
  fastify.get('/menus/:id', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      const { id } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.getMenu(tenantId, id);
      
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
  fastify.get('/menus/:id/tree', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      const { id } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const tree = await menuService.getMenuTree(tenantId, id);
      
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
  fastify.post('/menus', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.body.tenantId;
      const userId = request.user?.id;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.createMenu(tenantId, request.body, userId);
      
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
  fastify.put('/menus/:id', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.body.tenantId;
      const { id } = request.params;
      const userId = request.user?.id;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.updateMenu(tenantId, id, request.body, userId);
      
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
  fastify.delete('/menus/:id', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      const { id } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      await menuService.deleteMenu(tenantId, id);
      
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
  fastify.post('/menus/:id/duplicate', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.body.tenantId;
      const { id } = request.params;
      const { name } = request.body;
      const userId = request.user?.id;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      if (!name) {
        return reply.code(400).send({ error: 'Name required' });
      }
      
      const menu = await menuService.duplicateMenu(tenantId, id, name, userId);
      
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
  fastify.post('/menus/:id/items', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.body.tenantId;
      const { id } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.addMenuItem(tenantId, id, request.body);
      
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
  fastify.put('/menus/:id/items/:itemId', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.body.tenantId;
      const { id, itemId } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.updateMenuItem(tenantId, id, itemId, request.body);
      
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
  fastify.delete('/menus/:id/items/:itemId', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      const { id, itemId } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.deleteMenuItem(tenantId, id, itemId);
      
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
  fastify.post('/menus/:id/reorder', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.body.tenantId;
      const { id } = request.params;
      const { items } = request.body; // [{ id, order, parentId }]
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      if (!items || !Array.isArray(items)) {
        return reply.code(400).send({ error: 'Items array required' });
      }
      
      const menu = await menuService.reorderMenuItems(tenantId, id, items);
      
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
  fastify.post('/menus/:id/items/:itemId/move', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.body.tenantId;
      const { id, itemId } = request.params;
      const { parentId, order } = request.body;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.moveMenuItem(tenantId, id, itemId, parentId, order);
      
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
  fastify.get('/menus/stats', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const stats = await menuService.getMenuStats(tenantId);
      
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
  fastify.get('/public/menus/location/:location', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      const { location } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.getMenuByLocation(tenantId, location);
      
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
  fastify.get('/public/menus/slug/:slug', async (request, reply) => {
    try {
      const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
      const { slug } = request.params;
      
      if (!tenantId) {
        return reply.code(400).send({ error: 'Tenant ID required' });
      }
      
      const menu = await menuService.getMenuBySlug(tenantId, slug);
      
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
