const { Menu } = require('@contexthub/common/src/models');

/**
 * Menu Service - WordPress benzeri menu yönetimi
 */

class MenuService {
  /**
   * Tüm menüleri listele
   */
  async listMenus(tenantId, filters = {}) {
    const query = { tenantId };
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.location) {
      query.location = filters.location;
    }
    
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { slug: { $regex: filters.search, $options: 'i' } }
      ];
    }
    
    const menus = await Menu.find(query)
      .sort({ createdAt: -1 })
      .select('-items'); // Don't include items in list view
    
    return menus;
  }
  
  /**
   * Menu detayını getir
   */
  async getMenu(tenantId, menuId) {
    const menu = await Menu.findOne({
      _id: menuId,
      tenantId
    });
    
    if (!menu) {
      throw new Error('Menu not found');
    }
    
    return menu;
  }
  
  /**
   * Menu'yu tree yapısıyla getir
   */
  async getMenuTree(tenantId, menuId) {
    const menu = await this.getMenu(tenantId, menuId);
    return menu.getTree();
  }
  
  /**
   * Location'a göre menu getir (public endpoint için)
   */
  async getMenuByLocation(tenantId, location) {
    const menu = await Menu.getByLocation(tenantId, location);
    if (!menu) {
      return null;
    }
    
    return {
      ...menu.toObject(),
      tree: menu.getTree()
    };
  }
  
  /**
   * Slug'a göre menu getir (public endpoint için)
   */
  async getMenuBySlug(tenantId, slug) {
    const menu = await Menu.findOne({
      tenantId,
      slug,
      status: 'active'
    });
    
    if (!menu) {
      return null;
    }
    
    return {
      ...menu.toObject(),
      tree: menu.getTree()
    };
  }
  
  /**
   * Yeni menu oluştur
   */
  async createMenu(tenantId, menuData, userId) {
    // Slug unique olmalı
    const existing = await Menu.findOne({
      tenantId,
      slug: menuData.slug
    });
    
    if (existing) {
      throw new Error('Menu slug already exists');
    }
    
    const menu = new Menu({
      ...menuData,
      tenantId,
      meta: {
        ...menuData.meta,
        lastModifiedBy: userId
      }
    });
    
    await menu.save();
    return menu;
  }
  
  /**
   * Menu'yu güncelle
   */
  async updateMenu(tenantId, menuId, updates, userId) {
    const menu = await this.getMenu(tenantId, menuId);
    
    // Slug değiştiriliyorsa unique kontrolü yap
    if (updates.slug && updates.slug !== menu.slug) {
      const existing = await Menu.findOne({
        tenantId,
        slug: updates.slug,
        _id: { $ne: menuId }
      });
      
      if (existing) {
        throw new Error('Menu slug already exists');
      }
    }
    
    // Update fields
    Object.assign(menu, updates);
    menu.meta.lastModifiedBy = userId;
    
    await menu.save();
    return menu;
  }
  
  /**
   * Menu'yu sil
   */
  async deleteMenu(tenantId, menuId) {
    const menu = await this.getMenu(tenantId, menuId);
    await menu.deleteOne();
    return { success: true };
  }
  
  /**
   * Menu'yu kopyala
   */
  async duplicateMenu(tenantId, menuId, newName, userId) {
    const original = await this.getMenu(tenantId, menuId);
    
    // Generate unique slug
    let slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let counter = 1;
    while (await Menu.findOne({ tenantId, slug })) {
      slug = `${newName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${counter}`;
      counter++;
    }
    
    const duplicated = new Menu({
      ...original.toObject(),
      _id: undefined,
      name: newName,
      slug,
      status: 'draft',
      createdAt: undefined,
      updatedAt: undefined,
      meta: {
        ...original.meta,
        lastModifiedBy: userId
      }
    });
    
    await duplicated.save();
    return duplicated;
  }
  
  // ==================== MENU ITEMS ====================
  
  /**
   * Menu item ekle
   */
  async addMenuItem(tenantId, menuId, itemData) {
    const menu = await this.getMenu(tenantId, menuId);
    
    // Validate parentId if exists
    if (itemData.parentId) {
      const parent = menu.getItem(itemData.parentId);
      if (!parent) {
        throw new Error('Parent menu item not found');
      }
    }
    
    await menu.addItem(itemData);
    return menu;
  }
  
  /**
   * Menu item güncelle
   */
  async updateMenuItem(tenantId, menuId, itemId, updates) {
    const menu = await this.getMenu(tenantId, menuId);
    await menu.updateItem(itemId, updates);
    return menu;
  }
  
  /**
   * Menu item sil
   */
  async deleteMenuItem(tenantId, menuId, itemId) {
    const menu = await this.getMenu(tenantId, menuId);
    await menu.deleteItem(itemId);
    return menu;
  }
  
  /**
   * Menu items'ı yeniden sırala
   */
  async reorderMenuItems(tenantId, menuId, itemOrders) {
    const menu = await this.getMenu(tenantId, menuId);
    
    // Validate all item IDs exist
    const invalidIds = itemOrders.filter(({ id }) => !menu.getItem(id));
    if (invalidIds.length > 0) {
      throw new Error('Some menu items not found');
    }
    
    await menu.reorderItems(itemOrders);
    return menu;
  }
  
  /**
   * Menu item'ı taşı (parent değiştir)
   */
  async moveMenuItem(tenantId, menuId, itemId, newParentId, newOrder) {
    const menu = await this.getMenu(tenantId, menuId);
    
    const item = menu.getItem(itemId);
    if (!item) {
      throw new Error('Menu item not found');
    }
    
    // Validate new parent if exists
    if (newParentId) {
      const parent = menu.getItem(newParentId);
      if (!parent) {
        throw new Error('Parent menu item not found');
      }
      
      // Check if parent is not a child of the item being moved
      const isChildOfItem = (parentId, childId) => {
        const parent = menu.getItem(parentId);
        if (!parent) return false;
        if (parent._id.toString() === childId.toString()) return true;
        if (parent.parentId) {
          return isChildOfItem(parent.parentId, childId);
        }
        return false;
      };
      
      if (isChildOfItem(newParentId, itemId)) {
        throw new Error('Cannot move item to its own child');
      }
    }
    
    // Update item
    item.parentId = newParentId || null;
    item.order = newOrder || 0;
    
    await menu.save();
    return menu;
  }
  
  /**
   * Menu statistics
   */
  async getMenuStats(tenantId) {
    const menus = await Menu.find({ tenantId });
    
    return {
      total: menus.length,
      byStatus: {
        active: menus.filter(m => m.status === 'active').length,
        draft: menus.filter(m => m.status === 'draft').length,
        archived: menus.filter(m => m.status === 'archived').length
      },
      byLocation: {
        header: menus.filter(m => m.location === 'header').length,
        footer: menus.filter(m => m.location === 'footer').length,
        sidebar: menus.filter(m => m.location === 'sidebar').length,
        mobile: menus.filter(m => m.location === 'mobile').length,
        custom: menus.filter(m => m.location === 'custom').length
      },
      totalItems: menus.reduce((sum, m) => sum + m.meta.totalItems, 0)
    };
  }
}

module.exports = new MenuService();
