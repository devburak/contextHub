const mongoose = require('mongoose');

/**
 * Subscription Plan Model
 * Defines pricing tiers and their limits
 */
const subscriptionPlanSchema = new mongoose.Schema(
  {
    // Plan identifier (unique)
    slug: {
      type: String,
      required: true,
      unique: true,
      enum: ['free', 'pro', 'promax', 'enterprise'],
    },
    
    // Display name
    name: {
      type: String,
      required: true,
    },
    
    // Plan description
    description: {
      type: String,
      default: '',
    },
    
    // Monthly price in USD
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    
    // Billing type
    billingType: {
      type: String,
      enum: ['fixed', 'usage-based'], // fixed: monthly flat fee, usage-based: pay as you go
      default: 'fixed',
    },
    
    // === LIMITS ===
    
    // User limits
    userLimit: {
      type: Number,
      default: null, // null = unlimited
    },
    
    ownerLimit: {
      type: Number,
      default: null, // null = unlimited
    },
    
    // Storage limit in bytes
    storageLimit: {
      type: Number,
      required: false, // null = unlimited
      default: null,
    },
    
    // Monthly API request limit
    monthlyRequestLimit: {
      type: Number,
      required: false, // null = unlimited
      default: null,
    },
    
    // === ENTERPRISE PRICING (usage-based) ===
    
    // Price per GB storage (for enterprise)
    pricePerGBStorage: {
      type: Number,
      default: 0,
    },
    
    // Price per 1K requests (for enterprise)
    pricePerThousandRequests: {
      type: Number,
      default: 0,
    },
    
    // Plan status
    isActive: {
      type: Boolean,
      default: true,
    },
    
    // Sort order for display
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for active plans
subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });

// Static method to get all active plans
subscriptionPlanSchema.statics.getActivePlans = async function() {
  return this.find({ isActive: true }).sort({ sortOrder: 1 });
};

// Static method to get plan by slug
subscriptionPlanSchema.statics.getPlanBySlug = async function(slug) {
  return this.findOne({ slug, isActive: true });
};

// Method to check if limit is unlimited
subscriptionPlanSchema.methods.isUnlimited = function(limitType) {
  return this[limitType] === null || this[limitType] === -1;
};

// Method to calculate usage cost (for enterprise)
subscriptionPlanSchema.methods.calculateUsageCost = function(storageGB, requestCount) {
  if (this.billingType !== 'usage-based') {
    return this.price;
  }
  
  const storageCost = storageGB * this.pricePerGBStorage;
  const requestCost = (requestCount / 1000) * this.pricePerThousandRequests;
  
  return storageCost + requestCost;
};

// Method to format storage limit for display
subscriptionPlanSchema.methods.formatStorageLimit = function() {
  if (this.isUnlimited('storageLimit')) {
    return 'Sınırsız';
  }
  
  const gb = this.storageLimit / (1024 ** 3);
  return `${gb} GB`;
};

// Method to format request limit for display
subscriptionPlanSchema.methods.formatRequestLimit = function() {
  if (this.isUnlimited('monthlyRequestLimit')) {
    return 'Sınırsız';
  }
  
  if (this.monthlyRequestLimit >= 1000) {
    return `${this.monthlyRequestLimit / 1000}K`;
  }
  
  return this.monthlyRequestLimit.toString();
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlan;
