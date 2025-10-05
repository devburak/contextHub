const mongoose = require('mongoose');

/**
 * Menu Schema - WordPress benzeri iç içe menu sistemi
 * 
 * Özellikler:
 * - Birden fazla menu oluşturma
 * - İç içe menu items (parent-child)
 * - Custom URL veya internal link
 * - Drag & drop sıralama
 * - Tenant bazlı
 */

const MenuItemSchema = new mongoose.Schema({
  // Temel Bilgiler
  title: {
    type: String,
    required: true,
    trim: true
  },
  
  // Link Tipi
  type: {
    type: String,
    enum: ['custom', 'page', 'category', 'content', 'form', 'external'],
    default: 'custom'
  },
  
  // Custom URL (type: custom veya external için)
  url: {
    type: String,
    trim: true
  },
  
  // Internal Link (type: page, category, content için)
  reference: {
    model: {
      type: String,
      enum: ['Page', 'Category', 'Content', 'Form']
    },
    id: {
      type: mongoose.Schema.Types.ObjectId
    }
  },
  
  // Target (_blank, _self)
  target: {
    type: String,
    enum: ['_self', '_blank'],
    default: '_self'
  },
  
  // CSS Classes
  cssClasses: {
    type: String,
    trim: true
  },
  
  // Icon (optional)
  icon: {
    type: String,
    trim: true
  },
  
  // Description (tooltip)
  description: {
    type: String,
    trim: true
  },
  
  // Hiyerarşi
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    default: null
  },
  
  // Sıralama
  order: {
    type: Number,
    default: 0
  },
  
  // Görünürlük
  isVisible: {
    type: Boolean,
    default: true
  },
  
  // Alt menüler (virtual field)
  children: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem'
  }]
}, {
  timestamps: true
});

// Indexes
MenuItemSchema.index({ parentId: 1, order: 1 });
MenuItemSchema.index({ isVisible: 1 });

const MenuSchema = new mongoose.Schema({
  // Temel Bilgiler
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  
  description: {
    type: String,
    trim: true
  },
  
  // Location (header, footer, sidebar, mobile)
  location: {
    type: String,
    enum: ['header', 'footer', 'sidebar', 'mobile', 'custom'],
    default: 'header'
  },
  
  // Menu Items (stored directly in menu for better performance)
  items: [MenuItemSchema],
  
  // Durum
  status: {
    type: String,
    enum: ['active', 'draft', 'archived'],
    default: 'draft'
  },
  
  // Tenant ID
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  // Meta
  meta: {
    totalItems: {
      type: Number,
      default: 0
    },
    maxDepth: {
      type: Number,
      default: 3 // Maximum nesting level
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true
});

// Indexes
MenuSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
MenuSchema.index({ tenantId: 1, location: 1 });
MenuSchema.index({ status: 1 });

// Virtual: Root items (items without parent)
MenuSchema.virtual('rootItems').get(function() {
  return this.items.filter(item => !item.parentId);
});

// Method: Get menu tree structure
MenuSchema.methods.getTree = function() {
  const buildTree = (items, parentId = null) => {
    return items
      .filter(item => {
        const itemParentId = item.parentId ? item.parentId.toString() : null;
        return itemParentId === parentId;
      })
      .sort((a, b) => a.order - b.order)
      .map(item => ({
        ...item.toObject(),
        children: buildTree(items, item._id.toString())
      }));
  };
  
  return buildTree(this.items);
};

// Method: Get item by ID
MenuSchema.methods.getItem = function(itemId) {
  return this.items.id(itemId);
};

// Method: Add item
MenuSchema.methods.addItem = function(itemData) {
  // Calculate order
  const siblings = this.items.filter(item => {
    const itemParentId = item.parentId ? item.parentId.toString() : null;
    const newParentId = itemData.parentId ? itemData.parentId.toString() : null;
    return itemParentId === newParentId;
  });
  
  itemData.order = siblings.length;
  this.items.push(itemData);
  this.meta.totalItems = this.items.length;
  
  return this.save();
};

// Method: Update item
MenuSchema.methods.updateItem = function(itemId, updates) {
  const item = this.items.id(itemId);
  if (!item) {
    throw new Error('Menu item not found');
  }
  
  Object.assign(item, updates);
  return this.save();
};

// Method: Delete item (and its children)
MenuSchema.methods.deleteItem = function(itemId) {
  const deleteRecursive = (id) => {
    // Find children
    const children = this.items.filter(item => 
      item.parentId && item.parentId.toString() === id.toString()
    );
    
    // Delete children recursively
    children.forEach(child => {
      deleteRecursive(child._id);
    });
    
    // Delete the item
    this.items.pull(id);
  };
  
  deleteRecursive(itemId);
  this.meta.totalItems = this.items.length;
  
  return this.save();
};

// Method: Reorder items
MenuSchema.methods.reorderItems = function(itemOrders) {
  // itemOrders: [{ id, order, parentId }]
  itemOrders.forEach(({ id, order, parentId }) => {
    const item = this.items.id(id);
    if (item) {
      item.order = order;
      if (parentId !== undefined) {
        item.parentId = parentId || null;
      }
    }
  });
  
  return this.save();
};

// Method: Get menu depth
MenuSchema.methods.getDepth = function(itemId = null) {
  const getItemDepth = (id, depth = 0) => {
    const children = this.items.filter(item => 
      item.parentId && item.parentId.toString() === id.toString()
    );
    
    if (children.length === 0) {
      return depth;
    }
    
    return Math.max(...children.map(child => 
      getItemDepth(child._id, depth + 1)
    ));
  };
  
  if (itemId) {
    return getItemDepth(itemId);
  }
  
  // Calculate max depth for entire menu
  const rootItems = this.items.filter(item => !item.parentId);
  if (rootItems.length === 0) return 0;
  
  return Math.max(...rootItems.map(item => getItemDepth(item._id, 1)));
};

// Method: Validate depth limit
MenuSchema.methods.validateDepth = function() {
  const currentDepth = this.getDepth();
  return currentDepth <= this.meta.maxDepth;
};

// Static: Get menus by location
MenuSchema.statics.getByLocation = function(tenantId, location) {
  return this.findOne({
    tenantId,
    location,
    status: 'active'
  });
};

// Static: Get active menus
MenuSchema.statics.getActiveMenus = function(tenantId) {
  return this.find({
    tenantId,
    status: 'active'
  });
};

// Pre-save: Update totalItems and validate depth
MenuSchema.pre('save', function(next) {
  this.meta.totalItems = this.items.length;
  
  // Validate depth
  if (!this.validateDepth()) {
    return next(new Error(`Menu depth exceeds maximum allowed depth of ${this.meta.maxDepth}`));
  }
  
  next();
});

const Menu = mongoose.model('Menu', MenuSchema);

module.exports = Menu;
