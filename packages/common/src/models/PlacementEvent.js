const { Schema, model } = require('mongoose');

/**
 * Placement Event Schema
 * Tracks all interactions with placements for analytics
 */
const placementEventSchema = new Schema({
  // References
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  placementId: { type: Schema.Types.ObjectId, ref: 'PlacementDefinition', required: true, index: true },
  experienceId: { type: Schema.Types.ObjectId, required: true, index: true },
  
  // Event Type
  type: {
    type: String,
    enum: [
      'impression',    // Placement loaded/inserted into DOM
      'view',         // Placement entered viewport (actually seen)
      'click',        // User clicked on placement content
      'close',        // User closed placement with X button
      'dismiss',      // Auto-closed (timeout, navigation)
      'submit',       // Form submission or primary CTA
      'conversion',   // Goal achieved
      'error'         // Error occurred
    ],
    required: true,
    index: true
  },
  
  // Session Context
  sessionId: { type: String, required: true, index: true }, // Frontend-generated UUID
  trackingId: { type: String, index: true }, // Correlates events in same placement session
  
  // User Context
  userKey: { type: String, index: true }, // Anonymized hash (e.g., IP + UA hash)
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // If authenticated
  
  // Page Context
  path: { type: String, required: true },
  referrer: { type: String },
  locale: { type: String },
  title: { type: String }, // Page title
  
  // Device Context
  device: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown'
  },
  browser: { type: String }, // chrome, safari, firefox, edge
  browserVersion: { type: String },
  os: { type: String }, // ios, android, windows, macos, linux
  osVersion: { type: String },
  screenSize: { type: String }, // "1920x1080"
  viewport: { type: String }, // "1200x800"
  
  // Interaction Details
  duration: { type: Number }, // ms spent viewing before event
  scrollDepth: { type: Number }, // % of page scrolled when event occurred
  clickTarget: { type: String }, // CSS selector/text of clicked element
  clickPosition: {
    x: { type: Number },
    y: { type: Number }
  },
  
  // Conversion Details (for type='conversion')
  conversionGoal: { type: String }, // goal type from experience.conversions.goals
  conversionValue: { type: Number, default: 0 }, // monetary or weighted value
  
  // Form Details (for type='submit')
  formId: { type: Schema.Types.ObjectId, ref: 'FormDefinition' },
  formData: { type: Schema.Types.Mixed }, // sanitized form data
  
  // Error Details (for type='error')
  error: {
    message: { type: String },
    stack: { type: String },
    code: { type: String }
  },
  
  // A/B Testing
  variantWeight: { type: Number }, // Weight used in selection algorithm
  variantPriority: { type: Number }, // Priority at time of selection
  
  // Frequency Cap Context
  capKey: { type: String }, // Which cap was checked
  capCount: { type: Number }, // Current count at time of event
  
  // Metadata
  metadata: { type: Schema.Types.Mixed }, // Custom additional data
  userAgent: { type: String },
  ip: { type: String }, // Hashed or anonymized
  
  // Timing
  timestamp: { type: Date, default: Date.now, required: true, index: true },
  serverTimestamp: { type: Date, default: Date.now },
  
  // Data retention
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } } // TTL for GDPR compliance
});

// Compound indexes for common queries
placementEventSchema.index({ tenantId: 1, placementId: 1, type: 1, timestamp: -1 });
placementEventSchema.index({ tenantId: 1, experienceId: 1, type: 1, timestamp: -1 });
placementEventSchema.index({ sessionId: 1, type: 1, timestamp: 1 });
placementEventSchema.index({ userKey: 1, timestamp: -1 });
placementEventSchema.index({ tenantId: 1, type: 1, timestamp: -1 });

/**
 * Pre-save hook: Set expiration based on tenant settings
 */
placementEventSchema.pre('save', function(next) {
  // Auto-expire analytics data after 90 days (configurable)
  if (!this.expiresAt) {
    const retentionDays = 90; // TODO: Get from TenantSettings
    this.expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  }
  next();
});

/**
 * Static: Track event with validation
 */
placementEventSchema.statics.trackEvent = async function(eventData) {
  try {
    // Validate required fields
    if (!eventData.tenantId || !eventData.placementId || !eventData.experienceId || !eventData.type) {
      throw new Error('Missing required event fields');
    }
    
    // Sanitize sensitive data
    if (eventData.formData) {
      eventData.formData = sanitizeFormData(eventData.formData);
    }
    
    if (eventData.ip) {
      eventData.ip = hashIP(eventData.ip);
    }
    
    const event = new this(eventData);
    await event.save();
    
    return event;
  } catch (error) {
    console.error('Failed to track placement event:', error);
    // Don't throw - analytics failures shouldn't break user experience
    return null;
  }
};

/**
 * Static: Batch track events (for offline queue)
 */
placementEventSchema.statics.trackEventsBatch = async function(events) {
  try {
    const sanitizedEvents = events.map(event => {
      if (event.formData) {
        event.formData = sanitizeFormData(event.formData);
      }
      if (event.ip) {
        event.ip = hashIP(event.ip);
      }
      return event;
    });
    
    const result = await this.insertMany(sanitizedEvents, { ordered: false });
    return { success: true, count: result.length };
  } catch (error) {
    console.error('Failed to batch track events:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Static: Get analytics for placement
 */
placementEventSchema.statics.getPlacementStats = async function({
  tenantId,
  placementId,
  experienceId,
  startDate,
  endDate,
  groupBy = 'day'
}) {
  const match = {
    tenantId,
    placementId,
    timestamp: { $gte: startDate, $lte: endDate }
  };
  
  if (experienceId) {
    match.experienceId = experienceId;
  }
  
  const groupByFormat = {
    hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } },
    day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
    week: { $dateToString: { format: '%Y-W%V', date: '$timestamp' } },
    month: { $dateToString: { format: '%Y-%m', date: '$timestamp' } }
  };
  
  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          date: groupByFormat[groupBy],
          experienceId: '$experienceId',
          type: '$type'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        totalValue: { $sum: '$conversionValue' }
      }
    },
    {
      $group: {
        _id: { date: '$_id.date', experienceId: '$_id.experienceId' },
        impressions: {
          $sum: { $cond: [{ $eq: ['$_id.type', 'impression'] }, '$count', 0] }
        },
        views: {
          $sum: { $cond: [{ $eq: ['$_id.type', 'view'] }, '$count', 0] }
        },
        clicks: {
          $sum: { $cond: [{ $eq: ['$_id.type', 'click'] }, '$count', 0] }
        },
        conversions: {
          $sum: { $cond: [{ $eq: ['$_id.type', 'conversion'] }, '$count', 0] }
        },
        closes: {
          $sum: { $cond: [{ $eq: ['$_id.type', 'close'] }, '$count', 0] }
        },
        avgDuration: { $avg: '$avgDuration' },
        totalRevenue: { $sum: '$totalValue' }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]);
};

/**
 * Static: Get conversion funnel
 */
placementEventSchema.statics.getConversionFunnel = async function({
  tenantId,
  placementId,
  experienceId,
  startDate,
  endDate
}) {
  const match = {
    tenantId,
    placementId,
    experienceId,
    timestamp: { $gte: startDate, $lte: endDate }
  };
  
  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$sessionId',
        events: { $push: '$type' }
      }
    },
    {
      $project: {
        hasImpression: { $in: ['impression', '$events'] },
        hasView: { $in: ['view', '$events'] },
        hasClick: { $in: ['click', '$events'] },
        hasConversion: { $in: ['conversion', '$events'] }
      }
    },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        impressions: { $sum: { $cond: ['$hasImpression', 1, 0] } },
        views: { $sum: { $cond: ['$hasView', 1, 0] } },
        clicks: { $sum: { $cond: ['$hasClick', 1, 0] } },
        conversions: { $sum: { $cond: ['$hasConversion', 1, 0] } }
      }
    }
  ]);
};

/**
 * Static: Get user journey
 */
placementEventSchema.statics.getUserJourney = async function({
  tenantId,
  sessionId,
  userKey
}) {
  const match = { tenantId };
  
  if (sessionId) {
    match.sessionId = sessionId;
  } else if (userKey) {
    match.userKey = userKey;
  } else {
    throw new Error('Either sessionId or userKey is required');
  }
  
  return await this.find(match)
    .sort({ timestamp: 1 })
    .select('placementId experienceId type timestamp path duration clickTarget conversionGoal')
    .populate('placementId', 'name slug')
    .lean();
};

/**
 * Static: Ensure indexes
/**
 * Helper: Sanitize form data (remove sensitive fields)
 */
function sanitizeFormData(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sensitive = ['password', 'ssn', 'creditCard', 'cvv', 'pin'];
  const sanitized = { ...data };
  
  Object.keys(sanitized).forEach(key => {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Helper: Hash IP address for privacy
 */
function hashIP(ip) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

const PlacementEvent = model('PlacementEvent', placementEventSchema);

module.exports = PlacementEvent;
