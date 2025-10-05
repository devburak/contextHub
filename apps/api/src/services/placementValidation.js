const { z } = require('zod');

/**
 * Placement Validation Schemas with Zod
 */

// UI Config Schema
const uiConfigSchema = z.object({
  variant: z.enum(['modal', 'slideIn', 'topBar', 'bottomBar', 'inline', 'fullscreen', 'toast', 'corner']).default('modal'),
  position: z.enum(['topLeft', 'topCenter', 'topRight', 'center', 'bottomLeft', 'bottomCenter', 'bottomRight', 'left', 'right']).optional(),
  width: z.union([z.number(), z.string()]).optional(),
  maxWidth: z.number().optional(),
  height: z.union([z.number(), z.string(), z.literal('auto')]).optional(),
  backdrop: z.boolean().default(true),
  backdropBlur: z.boolean().optional(),
  closeButton: z.boolean().default(true),
  closeOnBackdrop: z.boolean().optional(),
  closeOnEscape: z.boolean().optional(),
  animation: z.enum(['fade', 'slide', 'zoom', 'bounce', 'none']).optional(),
  animationDuration: z.number().optional(),
  theme: z.object({
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    borderRadius: z.number().optional(),
    shadow: z.boolean().optional(),
    padding: z.number().optional(),
    customCss: z.string().optional()
  }).optional(),
  cta: z.object({
    text: z.union([z.string(), z.record(z.string())]).optional(),
    link: z.string().optional(),
    style: z.enum(['primary', 'secondary', 'outline', 'link', 'ghost']).optional(),
    openInNewTab: z.boolean().optional()
  }).optional(),
  mobileOverrides: z.object({
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    variant: z.string().optional(),
    position: z.string().optional()
  }).optional()
}).optional();

// Trigger Schema
const triggerSchema = z.object({
  type: z.enum(['onLoad', 'afterDelay', 'onScroll', 'onExit', 'onClick', 'onIdle', 'onHover']).default('onLoad'),
  delay: z.number().optional(),
  scrollPercent: z.number().min(0).max(100).optional(),
  scrollDirection: z.enum(['down', 'up', 'both']).optional(),
  idleSeconds: z.number().optional(),
  selector: z.string().optional(),
  exitIntent: z.object({
    sensitivity: z.number().optional(),
    enabled: z.boolean().optional()
  }).optional()
}).optional();

// Frequency Schema
const frequencySchema = z.object({
  maxPerSession: z.number().optional(),
  maxPerDay: z.number().optional(),
  maxPerWeek: z.number().optional(),
  maxPerMonth: z.number().optional(),
  maxTotal: z.number().optional(),
  capKey: z.string().optional(),
  resetOnConversion: z.boolean().optional()
}).optional();

// Schedule Schema
const scheduleSchema = z.object({
  startAt: z.string().datetime().or(z.date()).optional(),
  endAt: z.string().datetime().or(z.date()).optional(),
  timezone: z.string().default('UTC'),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  hoursOfDay: z.array(z.number().min(0).max(23)).optional(),
  excludeDates: z.array(z.string().datetime().or(z.date())).optional()
}).optional();

// Cookie Rule Schema
const cookieRuleSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  operator: z.enum(['equals', 'notEquals', 'contains', 'notContains', 'exists', 'notExists', 'startsWith', 'endsWith']).default('equals')
});

// Conversion Goal Schema
const conversionGoalSchema = z.object({
  type: z.enum(['formSubmit', 'ctaClick', 'linkClick', 'timeOnPage', 'scrollDepth', 'custom']),
  value: z.number().default(1),
  eventName: z.string().optional(),
  selector: z.string().optional(),
  threshold: z.number().optional(),
  formId: z.string().optional()
});

// Rules Schema
const rulesSchema = z.object({
  paths: z.array(z.string()).optional(),
  pathMode: z.enum(['include', 'exclude']).default('include'),
  query: z.record(z.string()).optional(),
  locales: z.array(z.string()).optional(),
  devices: z.array(z.enum(['mobile', 'tablet', 'desktop'])).optional(),
  browsers: z.array(z.enum(['chrome', 'safari', 'firefox', 'edge', 'opera', 'other'])).optional(),
  os: z.array(z.enum(['ios', 'android', 'windows', 'macos', 'linux', 'other'])).optional(),
  authenticated: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
  userTags: z.array(z.string()).optional(),
  requiredFlags: z.array(z.string()).optional(),
  excludeFlags: z.array(z.string()).optional(),
  cookies: z.object({
    include: z.array(cookieRuleSchema).optional(),
    exclude: z.array(cookieRuleSchema).optional()
  }).optional(),
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  referrers: z.array(z.string()).optional(),
  excludeReferrers: z.array(z.string()).optional(),
  customScript: z.string().optional(),
  schedule: scheduleSchema,
  frequency: frequencySchema,
  trigger: triggerSchema
}).optional();

// Experience Schema
const experienceSchema = z.object({
  name: z.string().min(1, 'Experience adı gerekli'),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).default('draft'),
  priority: z.number().min(0).max(100).default(50),
  weight: z.number().min(0).max(100).default(100),
  contentType: z.enum(['content', 'media', 'form', 'html', 'component', 'external']),
  payload: z.object({
    contentId: z.string().optional(),
    mediaId: z.string().optional(),
    formId: z.string().optional(),
    html: z.string().optional(),
    componentId: z.string().optional(),
    externalUrl: z.string().url().optional(),
    data: z.any().optional()
  }),
  ui: uiConfigSchema,
  rules: rulesSchema,
  conversions: z.object({
    enabled: z.boolean().default(true),
    goals: z.array(conversionGoalSchema).optional()
  }).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional()
});

// Create Placement Schema
const createPlacementSchema = z.object({
  slug: z.string()
    .min(1, 'Slug gerekli')
    .regex(/^[a-z0-9-_]+$/, 'Slug sadece küçük harf, rakam, tire ve alt çizgi içerebilir'),
  name: z.union([
    z.string(),
    z.record(z.string())
  ]).refine(val => val, { message: 'Placement adı gerekli' }),
  description: z.string().optional(),
  category: z.enum(['popup', 'banner', 'inline', 'overlay', 'notification', 'widget', 'other']).default('popup'),
  defaultRules: z.object({
    frequency: frequencySchema,
    trigger: triggerSchema,
    schedule: scheduleSchema
  }).optional(),
  experiences: z.array(experienceSchema).min(1, 'En az bir experience gerekli'),
  settings: z.object({
    enableABTesting: z.boolean().default(true),
    enableAnalytics: z.boolean().default(true),
    respectDoNotTrack: z.boolean().default(true),
    fallbackExperienceId: z.string().optional(),
    maxExperiencesPerSession: z.number().default(1)
  }).optional(),
  tags: z.array(z.string()).optional()
});

// Update Placement Schema
const updatePlacementSchema = createPlacementSchema.partial().extend({
  status: z.enum(['active', 'paused', 'archived']).optional()
});

// Query Schema
const placementListQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'archived']).optional(),
  category: z.enum(['popup', 'banner', 'inline', 'overlay', 'notification', 'widget', 'other']).optional(),
  search: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

// Decision Context Schema (PUBLIC API)
const decisionContextSchema = z.object({
  placement: z.string().min(1, 'Placement slug gerekli'),
  context: z.object({
    path: z.string(),
    locale: z.string().optional(),
    device: z.enum(['mobile', 'tablet', 'desktop']).optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
    authenticated: z.boolean().optional(),
    userRoles: z.array(z.string()).optional(),
    userTags: z.array(z.string()).optional(),
    featureFlags: z.array(z.string()).optional(),
    query: z.record(z.string()).optional(),
    cookies: z.record(z.string()).optional(),
    referrer: z.string().optional(),
    sessionId: z.string(),
    userKey: z.string().optional(),
    seenCaps: z.record(z.number()).optional() // { "popup:newsletter": 2 }
  })
});

// Track Event Schema (PUBLIC API)
const trackEventSchema = z.object({
  tenantId: z.string().optional(), // from header X-Tenant-ID
  placementId: z.string(),
  experienceId: z.string(),
  type: z.enum(['impression', 'view', 'click', 'close', 'dismiss', 'submit', 'conversion', 'error']),
  sessionId: z.string(),
  trackingId: z.string().optional(),
  userKey: z.string().optional(),
  path: z.string(),
  referrer: z.string().optional(),
  locale: z.string().optional(),
  title: z.string().optional(),
  device: z.enum(['mobile', 'tablet', 'desktop', 'unknown']).optional(),
  browser: z.string().optional(),
  browserVersion: z.string().optional(),
  os: z.string().optional(),
  osVersion: z.string().optional(),
  screenSize: z.string().optional(),
  viewport: z.string().optional(),
  duration: z.number().optional(),
  scrollDepth: z.number().optional(),
  clickTarget: z.string().optional(),
  clickPosition: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  conversionGoal: z.string().optional(),
  conversionValue: z.number().optional(),
  formId: z.string().optional(),
  formData: z.any().optional(),
  error: z.object({
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional()
  }).optional(),
  metadata: z.any().optional(),
  userAgent: z.string().optional()
});

// Batch Track Schema
const batchTrackSchema = z.object({
  events: z.array(trackEventSchema).min(1).max(100)
});

// Stats Query Schema
const statsQuerySchema = z.object({
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().or(z.date()),
  experienceId: z.string().optional(),
  groupBy: z.enum(['hour', 'day', 'week', 'month']).default('day')
});

module.exports = {
  createPlacementSchema,
  updatePlacementSchema,
  placementListQuerySchema,
  experienceSchema,
  decisionContextSchema,
  trackEventSchema,
  batchTrackSchema,
  statsQuerySchema
};
