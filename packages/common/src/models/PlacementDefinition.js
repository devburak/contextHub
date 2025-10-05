const { Schema, model } = require('mongoose');

/**
 * UI Configuration Schema
 * Defines how the placement should be rendered
 */
const uiConfigSchema = new Schema({
  variant: {
    type: String,
    enum: ['modal', 'slideIn', 'topBar', 'bottomBar', 'inline', 'fullscreen', 'toast', 'corner'],
    default: 'modal'
  },
  position: {
    type: String,
    enum: ['topLeft', 'topCenter', 'topRight', 'center', 'bottomLeft', 'bottomCenter', 'bottomRight', 'left', 'right'],
    default: 'center'
  },
  width: { type: Schema.Types.Mixed }, // Number (px) or String ("%")
  maxWidth: { type: Number },
  height: { type: Schema.Types.Mixed }, // 'auto' or Number
  backdrop: { type: Boolean, default: true },
  backdropBlur: { type: Boolean, default: false },
  closeButton: { type: Boolean, default: true },
  closeOnBackdrop: { type: Boolean, default: true },
  closeOnEscape: { type: Boolean, default: true },
  animation: {
    type: String,
    enum: ['fade', 'slide', 'zoom', 'bounce', 'none'],
    default: 'fade'
  },
  animationDuration: { type: Number, default: 300 }, // ms
  theme: {
    backgroundColor: { type: String },
    textColor: { type: String },
    borderRadius: { type: Number, default: 8 },
    shadow: { type: Boolean, default: true },
    padding: { type: Number, default: 24 },
    customCss: { type: String }
  },
  cta: {
    text: { type: Schema.Types.Mixed }, // i18n: { tr: String, en: String }
    link: { type: String },
    style: {
      type: String,
      enum: ['primary', 'secondary', 'outline', 'link', 'ghost'],
      default: 'primary'
    },
    openInNewTab: { type: Boolean, default: false }
  },
  mobileOverrides: {
    width: { type: Schema.Types.Mixed },
    height: { type: Schema.Types.Mixed },
    variant: { type: String },
    position: { type: String }
  }
}, { _id: false });

/**
 * Trigger Configuration Schema
 * Defines when the placement should be shown
 */
const triggerSchema = new Schema({
  type: {
    type: String,
    enum: ['onLoad', 'afterDelay', 'onScroll', 'onExit', 'onClick', 'onIdle', 'onHover'],
    default: 'onLoad'
  },
  delay: { type: Number, default: 0 }, // ms for afterDelay
  scrollPercent: { type: Number, min: 0, max: 100 }, // for onScroll
  scrollDirection: {
    type: String,
    enum: ['down', 'up', 'both'],
    default: 'down'
  },
  idleSeconds: { type: Number }, // for onIdle
  selector: { type: String }, // CSS selector for onClick/onHover
  exitIntent: {
    sensitivity: { type: Number, default: 20 }, // px
    enabled: { type: Boolean, default: true }
  }
}, { _id: false });

/**
 * Frequency Capping Schema
 * Limits how often users see the placement
 */
const frequencySchema = new Schema({
  maxPerSession: { type: Number }, // per browser session
  maxPerDay: { type: Number },
  maxPerWeek: { type: Number },
  maxPerMonth: { type: Number },
  maxTotal: { type: Number }, // lifetime cap per user
  capKey: { type: String }, // localStorage key suffix: "placement:{slug}:{capKey}"
  resetOnConversion: { type: Boolean, default: false } // reset counter after conversion
}, { _id: false });

/**
 * Schedule Configuration Schema
 * Time-based rules for showing placement
 */
const scheduleSchema = new Schema({
  startAt: { type: Date },
  endAt: { type: Date },
  timezone: { type: String, default: 'UTC' }, // IANA timezone
  daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0=Sunday, 6=Saturday
  hoursOfDay: [{ type: Number, min: 0, max: 23 }], // 0-23 hour range
  excludeDates: [{ type: Date }] // blacklist dates (holidays, maintenance)
}, { _id: false });

/**
 * Cookie/Storage Matching Schema
 */
const cookieRuleSchema = new Schema({
  key: { type: String, required: true },
  value: { type: String },
  operator: {
    type: String,
    enum: ['equals', 'notEquals', 'contains', 'notContains', 'exists', 'notExists', 'startsWith', 'endsWith'],
    default: 'equals'
  }
}, { _id: false });

/**
 * Conversion Goal Schema
 */
const conversionGoalSchema = new Schema({
  type: {
    type: String,
    enum: ['formSubmit', 'ctaClick', 'linkClick', 'timeOnPage', 'scrollDepth', 'custom'],
    required: true
  },
  value: { type: Number, default: 1 }, // weight/score for analytics
  eventName: { type: String }, // custom event name
  selector: { type: String }, // CSS selector for click tracking
  threshold: { type: Number }, // seconds for timeOnPage, % for scrollDepth
  formId: { type: Schema.Types.ObjectId, ref: 'FormDefinition' } // for formSubmit
}, { _id: false });

/**
 * Targeting Rules Schema
 * Comprehensive targeting options
 */
const rulesSchema = new Schema({
  // URL/Path matching
  paths: [{ type: String }], // glob patterns: ["/", "/blog/*", "!/admin/*"]
  pathMode: {
    type: String,
    enum: ['include', 'exclude'],
    default: 'include'
  },
  query: { type: Schema.Types.Mixed }, // query params: { utm_source: "email" }
  
  // Localization
  locales: [{ type: String }], // ["tr", "en"]
  
  // Device/Browser
  devices: [{
    type: String,
    enum: ['mobile', 'tablet', 'desktop']
  }],
  browsers: [{
    type: String,
    enum: ['chrome', 'safari', 'firefox', 'edge', 'opera', 'other']
  }],
  os: [{
    type: String,
    enum: ['ios', 'android', 'windows', 'macos', 'linux', 'other']
  }],
  
  // User Context
  authenticated: { type: Boolean }, // null=both, true=logged in, false=guest
  roles: [{ type: String }], // ["subscriber", "premium", "admin"]
  userTags: [{ type: String }], // ["vip", "churned", "trial"]
  
  // Feature Flags
  requiredFlags: [{ type: String }], // must have ALL these flags
  excludeFlags: [{ type: String }], // must NOT have ANY of these flags
  
  // Cookies/Storage
  cookies: {
    include: [cookieRuleSchema],
    exclude: [cookieRuleSchema]
  },
  
  // Geolocation (future)
  countries: [{ type: String }], // ISO 3166-1 alpha-2: ["TR", "US"]
  cities: [{ type: String }],
  regions: [{ type: String }],
  
  // Referrer
  referrers: [{ type: String }], // glob patterns
  excludeReferrers: [{ type: String }],
  
  // Custom conditions (for advanced users)
  customScript: { type: String }, // JavaScript expression that returns boolean
  
  // Schedule
  schedule: scheduleSchema,
  
  // Frequency capping
  frequency: frequencySchema,
  
  // Trigger
  trigger: triggerSchema
}, { _id: false });

/**
 * Experience Analytics Schema
 * Track performance metrics
 */
const experienceStatsSchema = new Schema({
  impressions: { type: Number, default: 0 },
  views: { type: Number, default: 0 }, // impressions where user actually saw it (viewport)
  clicks: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  closes: { type: Number, default: 0 },
  dismissals: { type: Number, default: 0 },
  avgDuration: { type: Number, default: 0 }, // ms
  totalRevenue: { type: Number, default: 0 }, // if tracking revenue
  lastUpdated: { type: Date, default: Date.now }
}, { _id: false });

/**
 * Experience Schema
 * Individual variants within a placement
 */
const experienceSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'archived'],
    default: 'draft'
  },
  priority: { type: Number, default: 50, min: 0, max: 100 }, // Higher = shown first
  weight: { type: Number, default: 100, min: 0, max: 100 }, // A/B testing weight %
  
  // Content Payload
  contentType: {
    type: String,
    enum: ['content', 'media', 'form', 'html', 'component', 'external'],
    required: true
  },
  payload: {
    contentId: { type: Schema.Types.ObjectId, ref: 'Content' },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
    formId: { type: Schema.Types.ObjectId, ref: 'FormDefinition' },
    html: { type: String },
    componentId: { type: String }, // React component identifier
    externalUrl: { type: String }, // iframe URL
    data: { type: Schema.Types.Mixed } // Extra props/config
  },
  
  // UI Configuration
  ui: uiConfigSchema,
  
  // Targeting Rules
  rules: rulesSchema,
  
  // Conversion Tracking
  conversions: {
    enabled: { type: Boolean, default: true },
    goals: [conversionGoalSchema]
  },
  
  // Analytics
  stats: experienceStatsSchema,
  
  // Metadata
  tags: [{ type: String }], // for organization/filtering
  notes: { type: String }, // internal notes
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Update timestamp on save
experienceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

/**
 * Placement Definition Schema
 * Main model for managing promotional placements
 */
const placementDefinitionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  
  // Identification
  slug: { type: String, required: true }, // "home_hero_banner", "global_popup"
  name: { type: Schema.Types.Mixed, required: true }, // i18n: { tr: String, en: String }
  description: { type: String },
  
  // Category for UI organization
  category: {
    type: String,
    enum: ['popup', 'banner', 'inline', 'overlay', 'notification', 'widget', 'other'],
    default: 'popup'
  },
  
  // Default rules applied to all experiences (can be overridden)
  defaultRules: {
    frequency: frequencySchema,
    trigger: triggerSchema,
    schedule: scheduleSchema
  },
  
  // Experiences (variants/A-B tests)
  experiences: [experienceSchema],
  
  // Global placement settings
  settings: {
    enableABTesting: { type: Boolean, default: true },
    enableAnalytics: { type: Boolean, default: true },
    respectDoNotTrack: { type: Boolean, default: true },
    fallbackExperienceId: { type: Schema.Types.ObjectId }, // shown if no rules match
    maxExperiencesPerSession: { type: Number, default: 1 } // prevent spam
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'paused', 'archived'],
    default: 'active'
  },
  
  // Metadata
  tags: [{ type: String }],
  
  // Audit trail
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Indexes for performance
placementDefinitionSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
placementDefinitionSchema.index({ tenantId: 1, status: 1 });
placementDefinitionSchema.index({ tenantId: 1, category: 1 });
placementDefinitionSchema.index({ 'experiences.status': 1 });
placementDefinitionSchema.index({ tags: 1 });

// Update timestamp on save
placementDefinitionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

/**
 * Virtual: Active Experiences
 * Get only active experiences sorted by priority
 */
placementDefinitionSchema.virtual('activeExperiences').get(function() {
  return this.experiences
    .filter(exp => exp.status === 'active')
    .sort((a, b) => b.priority - a.priority);
});

/**
 * Method: Get eligible experiences for context
 */
placementDefinitionSchema.methods.getEligibleExperiences = function(context) {
  return this.activeExperiences.filter(exp => {
    // Basic checks
    if (!exp.rules) return true;
    
    // Path matching
    if (exp.rules.paths?.length) {
      const pathMatch = matchPaths(context.path, exp.rules.paths, exp.rules.pathMode);
      if (!pathMatch) return false;
    }
    
    // Locale matching
    if (exp.rules.locales?.length && !exp.rules.locales.includes(context.locale)) {
      return false;
    }
    
    // Device matching
    if (exp.rules.devices?.length && !exp.rules.devices.includes(context.device)) {
      return false;
    }
    
    // Authentication
    if (exp.rules.authenticated !== null && exp.rules.authenticated !== undefined) {
      if (exp.rules.authenticated !== context.authenticated) return false;
    }
    
    return true;
  });
};

/**
 * Helper: Match paths with glob patterns
 */
function matchPaths(path, patterns, mode = 'include') {
  const micromatch = require('micromatch');
  const isMatch = micromatch.isMatch(path, patterns);
  return mode === 'include' ? isMatch : !isMatch;
}

const PlacementDefinition = model('PlacementDefinition', placementDefinitionSchema);

module.exports = PlacementDefinition;
