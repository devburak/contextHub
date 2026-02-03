const mongoose = require('mongoose');

/**
 * API Usage Statistics Model
 * Stores aggregated API usage data from Redis for billing and reporting
 */
const apiUsageSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  
  // Period type: 'halfday', 'daily', 'weekly', 'monthly'
  period: {
    type: String,
    enum: ['halfday', 'daily', 'weekly', 'monthly'],
    required: true,
    index: true,
  },
  
  // Period identifier
  periodKey: {
    type: String,
    required: true,
    // Examples: '2025-10-08T00' (halfday), '2025-10-08' (daily), '2025-W41' (weekly), '2025-10' (monthly)
  },
  
  // Start and end dates of the period
  startDate: {
    type: Date,
    required: true,
    index: true,
  },
  
  endDate: {
    type: Date,
    required: true,
  },
  
  // Total API calls in this period
  totalCalls: {
    type: Number,
    required: true,
    default: 0,
  },
  
  // Breakdown by endpoint (optional, for detailed analytics)
  endpointBreakdown: [{
    endpoint: String,
    count: Number,
  }],
  
  // Breakdown by status code (optional)
  statusCodeBreakdown: {
    success: { type: Number, default: 0 }, // 2xx
    clientError: { type: Number, default: 0 }, // 4xx
    serverError: { type: Number, default: 0 }, // 5xx
  },
  
  // Average response time in ms
  avgResponseTime: {
    type: Number,
    default: 0,
  },
  
  // Metadata
  syncedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Redis keys that were aggregated (for debugging)
  redisKeys: [{
    key: String,
    value: Number,
  }],
}, {
  timestamps: true,
});

// Compound index for unique period per tenant
apiUsageSchema.index({ tenantId: 1, period: 1, periodKey: 1 }, { unique: true });

// Index for date range queries
apiUsageSchema.index({ startDate: 1, endDate: 1 });
// Optimized index for tenant + period + range queries
apiUsageSchema.index({ tenantId: 1, period: 1, startDate: 1 });

// Static method to get usage for billing
apiUsageSchema.statics.getUsageForBilling = async function(tenantId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        tenantId: mongoose.Types.ObjectId(tenantId),
        startDate: { $gte: startDate },
        endDate: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$period',
        totalCalls: { $sum: '$totalCalls' },
        periods: { $push: '$$ROOT' },
      },
    },
  ]);
};

// Static method to get monthly report
apiUsageSchema.statics.getMonthlyReport = async function(tenantId, year, month) {
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  return this.findOne({
    tenantId: mongoose.Types.ObjectId(tenantId),
    period: 'monthly',
    periodKey,
  });
};

const ApiUsage = mongoose.model('ApiUsage', apiUsageSchema);

module.exports = ApiUsage;
