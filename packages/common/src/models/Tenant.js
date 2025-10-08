const mongoose = require('mongoose');
const { Schema } = mongoose;

const tenantSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  plan: { type: String, default: 'free' },
  status: { type: String, default: 'active', enum: ['active', 'inactive', 'suspended'] },
  
  // === SUBSCRIPTION INFO ===
  
  // Current subscription plan reference
  currentPlan: {
    type: Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    default: null, // null = free plan
  },
  
  // Subscription start date
  subscriptionStartDate: {
    type: Date,
    default: null,
  },
  
  // Billing cycle start (for usage tracking)
  billingCycleStart: {
    type: Date,
    default: null,
  },
  
  // Custom limits (overrides plan limits for special cases)
  customLimits: {
    userLimit: { type: Number, default: null },
    ownerLimit: { type: Number, default: null },
    storageLimit: { type: Number, default: null },
    monthlyRequestLimit: { type: Number, default: null },
  },
  
  // Current usage (for quick access, synced daily)
  currentUsage: {
    storageBytes: { type: Number, default: 0 },
    userCount: { type: Number, default: 0 },
    ownerCount: { type: Number, default: 0 },
    monthlyRequests: { type: Number, default: 0 }, // Current month
    lastUpdated: { type: Date, default: null },
  },
  
  // === END SUBSCRIPTION INFO ===
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
tenantSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
tenantSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
tenantSchema.index({ slug: 1 }, { unique: true });
tenantSchema.index({ currentPlan: 1 });
tenantSchema.index({ status: 1 });

// === INSTANCE METHODS ===

/**
 * Get effective limit for a specific metric
 * Priority: customLimits > plan limits > default
 */
tenantSchema.methods.getLimit = async function(limitType) {
  // Check custom limits first
  if (this.customLimits && this.customLimits[limitType] !== null && this.customLimits[limitType] !== undefined) {
    return this.customLimits[limitType];
  }
  
  // Get from plan
  if (this.currentPlan) {
    await this.populate('currentPlan');
    if (this.currentPlan && this.currentPlan[limitType] !== undefined) {
      return this.currentPlan[limitType];
    }
  }
  
  // Default free tier limits
  const defaultLimits = {
    userLimit: 2,
    ownerLimit: 1,
    storageLimit: 500 * 1024 * 1024, // 500 MB
    monthlyRequestLimit: 1000,
  };
  
  return defaultLimits[limitType] || 0;
};

/**
 * Check if tenant has reached a specific limit
 */
tenantSchema.methods.hasReachedLimit = async function(limitType) {
  const limit = await this.getLimit(limitType);
  
  // null or -1 means unlimited
  if (limit === null || limit === -1) {
    return false;
  }
  
  const usageKey = limitType.replace('Limit', 's'); // userLimit -> users, storageLimit -> storageBytes
  const currentValue = this.currentUsage?.[usageKey] || 0;
  
  return currentValue >= limit;
};

/**
 * Check if adding a value would exceed limit
 */
tenantSchema.methods.wouldExceedLimit = async function(limitType, additionalValue = 1) {
  const limit = await this.getLimit(limitType);
  
  // null or -1 means unlimited
  if (limit === null || limit === -1) {
    return false;
  }
  
  const usageKey = limitType.replace('Limit', '');
  const currentValue = this.currentUsage?.[usageKey] || 0;
  
  return (currentValue + additionalValue) > limit;
};

/**
 * Get remaining quota for a limit
 */
tenantSchema.methods.getRemainingQuota = async function(limitType) {
  const limit = await this.getLimit(limitType);
  
  // null or -1 means unlimited
  if (limit === null || limit === -1) {
    return Infinity;
  }
  
  const usageKey = limitType.replace('Limit', '');
  const currentValue = this.currentUsage?.[usageKey] || 0;
  
  return Math.max(0, limit - currentValue);
};

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;
