# Placement System - MongoDB Models

## Overview
Content-as-a-Service (CaaS) yaklaşımıyla popup, banner, inline content ve diğer promosyon yerleşimlerini yönetmek için kapsamlı bir sistem.

## Models

### 1. PlacementDefinition
Promosyon yerleşimlerinin ana tanımı. Bir placement birden fazla experience (A/B test varyantları) içerir.

#### Key Features:
- **Multi-tenant support**: Her tenant kendi placement'larını yönetir
- **Experience-based**: Her placement içinde birden fazla varyant (A/B testing)
- **Content type flexibility**: Content, Media, Form, HTML, React Component desteği
- **Advanced targeting**: Path, device, locale, user role, feature flags, cookies vb.
- **Scheduling**: Tarih/saat bazlı, timezone-aware gösterim
- **Frequency capping**: Session, günlük, haftalık, aylık limitler
- **Trigger conditions**: onLoad, scroll, exit-intent, idle, click-based
- **Analytics**: Otomatik impression, click, conversion tracking

#### Schema Structure:

```javascript
{
  tenantId: ObjectId,
  slug: "home_hero_banner",
  name: { tr: "Ana Sayfa Banner", en: "Home Hero Banner" },
  category: "popup" | "banner" | "inline" | "overlay" | "notification" | "widget",
  
  defaultRules: {
    frequency: { maxPerDay: 1, capKey: "newsletter_popup" },
    trigger: { type: "onLoad", delay: 2000 },
    schedule: { startAt, endAt, timezone }
  },
  
  experiences: [{
    _id: ObjectId,
    name: "Summer Sale Variant A",
    status: "active",
    priority: 80,      // 0-100, higher = first
    weight: 50,        // A/B split %
    
    contentType: "content" | "media" | "form" | "html" | "component",
    payload: {
      contentId: ObjectId,    // Content model reference
      mediaId: ObjectId,      // Media model reference
      formId: ObjectId,       // FormDefinition reference
      html: "<div>...</div>", // Raw HTML
      componentId: "PromoCard", // React component
      data: { ... }           // Component props
    },
    
    ui: {
      variant: "modal" | "slideIn" | "topBar" | "bottomBar" | "inline" | "fullscreen" | "toast",
      position: "center" | "topLeft" | "topRight" | "bottomRight" | ...,
      width: 480,
      backdrop: true,
      closeButton: true,
      animation: "fade" | "slide" | "zoom",
      theme: {
        backgroundColor: "#ffffff",
        borderRadius: 8,
        customCss: "..."
      },
      cta: {
        text: { tr: "İncele", en: "View" },
        link: "/sale",
        style: "primary"
      }
    },
    
    rules: {
      // URL/Path
      paths: ["/", "/blog/*", "!/admin/*"],
      pathMode: "include",
      query: { utm_source: "email" },
      
      // Localization
      locales: ["tr", "en"],
      
      // Device/Browser
      devices: ["mobile", "desktop"],
      browsers: ["chrome", "safari"],
      os: ["ios", "android"],
      
      // User Context
      authenticated: true,
      roles: ["premium", "subscriber"],
      userTags: ["vip", "trial"],
      
      // Feature Flags
      requiredFlags: ["newCheckout"],
      excludeFlags: ["bannersDisabled"],
      
      // Cookies
      cookies: {
        include: [{ key: "newsletter_shown", operator: "notExists" }],
        exclude: [{ key: "subscribed", value: "true" }]
      },
      
      // Geo (future)
      countries: ["TR", "US"],
      
      // Schedule
      schedule: {
        startAt: Date,
        endAt: Date,
        timezone: "Europe/Istanbul",
        daysOfWeek: [1,2,3,4,5], // Mon-Fri
        hoursOfDay: [9,10,11,...,17] // Business hours
      },
      
      // Frequency
      frequency: {
        maxPerSession: 1,
        maxPerDay: 2,
        maxPerWeek: 5,
        capKey: "summer_sale_popup"
      },
      
      // Trigger
      trigger: {
        type: "onScroll" | "onLoad" | "afterDelay" | "onExit" | "onClick" | "onIdle",
        delay: 3000,
        scrollPercent: 50,
        scrollDirection: "down",
        selector: ".cta-button"
      }
    },
    
    conversions: {
      enabled: true,
      goals: [{
        type: "formSubmit" | "ctaClick" | "linkClick" | "timeOnPage" | "scrollDepth",
        value: 10,
        eventName: "newsletter_signup"
      }]
    },
    
    stats: {
      impressions: 1234,
      views: 890,
      clicks: 156,
      conversions: 45,
      avgDuration: 8500,
      totalRevenue: 450
    }
  }],
  
  settings: {
    enableABTesting: true,
    enableAnalytics: true,
    respectDoNotTrack: true,
    maxExperiencesPerSession: 1
  },
  
  status: "active",
  tags: ["campaign-summer", "high-priority"]
}
```

#### Indexes:
```javascript
{ tenantId: 1, slug: 1 } // unique
{ tenantId: 1, status: 1 }
{ tenantId: 1, category: 1 }
{ 'experiences.status': 1 }
{ tags: 1 }
```

#### Methods:

**`getEligibleExperiences(context)`**
```javascript
// Returns experiences matching the given context
const eligible = placement.getEligibleExperiences({
  path: '/blog/post-1',
  locale: 'tr',
  device: 'mobile',
  authenticated: true,
  featureFlags: ['betaUI']
});
```

---

### 2. PlacementEvent
Tüm placement etkileşimlerini tracking için event modeli.

#### Event Types:
- **impression**: DOM'a yerleştirildi
- **view**: Viewport'a girdi (gerçekten görüldü)
- **click**: Kullanıcı tıkladı
- **close**: X ile kapatıldı
- **dismiss**: Otomatik kapandı
- **submit**: Form gönderildi / CTA tıklandı
- **conversion**: Hedef gerçekleşti
- **error**: Hata oluştu

#### Schema Structure:

```javascript
{
  tenantId: ObjectId,
  placementId: ObjectId,
  experienceId: ObjectId,
  
  type: "impression" | "view" | "click" | "close" | "submit" | "conversion",
  
  // Session
  sessionId: "uuid-v4",
  trackingId: "tracking-uuid",
  
  // User
  userKey: "hashed-user-id",
  userId: ObjectId, // if authenticated
  
  // Page Context
  path: "/blog/summer-sale",
  referrer: "https://google.com",
  locale: "tr",
  title: "Summer Sale - Blog",
  
  // Device
  device: "mobile",
  browser: "chrome",
  browserVersion: "120.0",
  os: "ios",
  osVersion: "17.2",
  screenSize: "1920x1080",
  viewport: "375x667",
  
  // Interaction
  duration: 8500, // ms
  scrollDepth: 75, // %
  clickTarget: ".cta-button",
  clickPosition: { x: 150, y: 300 },
  
  // Conversion
  conversionGoal: "formSubmit",
  conversionValue: 100,
  
  // Form (if type=submit)
  formId: ObjectId,
  formData: { email: "...", ... },
  
  // Error (if type=error)
  error: {
    message: "...",
    code: "RENDER_ERROR"
  },
  
  // A/B Context
  variantWeight: 50,
  variantPriority: 80,
  
  // Frequency
  capKey: "newsletter_popup",
  capCount: 2,
  
  // Meta
  metadata: { ... },
  userAgent: "...",
  ip: "hashed-ip",
  
  timestamp: Date,
  expiresAt: Date // TTL for GDPR (90 days default)
}
```

#### Indexes:
```javascript
{ tenantId: 1, placementId: 1, type: 1, timestamp: -1 }
{ tenantId: 1, experienceId: 1, type: 1, timestamp: -1 }
{ sessionId: 1, type: 1, timestamp: 1 }
{ userKey: 1, timestamp: -1 }
{ expiresAt: 1 } // TTL index
```

#### Static Methods:

**`trackEvent(eventData)`**
```javascript
await PlacementEvent.trackEvent({
  tenantId,
  placementId,
  experienceId,
  type: 'click',
  sessionId,
  path: '/blog',
  device: 'mobile',
  duration: 5000
});
```

**`trackEventsBatch(events[])`**
```javascript
// Offline queue için batch tracking
await PlacementEvent.trackEventsBatch([
  { type: 'impression', ... },
  { type: 'view', ... },
  { type: 'click', ... }
]);
```

**`getPlacementStats({ tenantId, placementId, startDate, endDate, groupBy })`**
```javascript
const stats = await PlacementEvent.getPlacementStats({
  tenantId,
  placementId,
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  groupBy: 'day' // 'hour' | 'day' | 'week' | 'month'
});

// Returns:
[{
  date: '2025-01-15',
  experienceId: '...',
  impressions: 1234,
  views: 890,
  clicks: 156,
  conversions: 45,
  clickRate: 17.5,
  conversionRate: 3.6,
  avgDuration: 8500,
  totalRevenue: 450
}]
```

**`getConversionFunnel({ tenantId, placementId, experienceId, startDate, endDate })`**
```javascript
const funnel = await PlacementEvent.getConversionFunnel({
  tenantId,
  placementId,
  experienceId,
  startDate,
  endDate
});

// Returns:
{
  totalSessions: 1000,
  impressions: 1000,
  views: 850,    // 85% entered viewport
  clicks: 170,   // 20% of views clicked
  conversions: 45 // 26% of clicks converted
}
```

**`getUserJourney({ tenantId, sessionId })`**
```javascript
const journey = await PlacementEvent.getUserJourney({
  tenantId,
  sessionId: 'uuid-v4'
});

// Returns:
[{
  placementId: { name: 'Newsletter Popup', slug: 'newsletter' },
  experienceId: '...',
  type: 'impression',
  timestamp: Date,
  path: '/blog',
  duration: 5000
}, ...]
```

---

## Privacy & GDPR Compliance

### Data Anonymization:
- **IP hashing**: SHA-256 ile hashleniyor
- **User keys**: Browser fingerprint hash
- **Form data sanitization**: Password, SSN, credit card otomatik redact
- **TTL**: 90 gün sonra otomatik siliniyor (configurable)

### Respect Do Not Track:
```javascript
settings: {
  respectDoNotTrack: true
}
```

---

## Usage Examples

### 1. Create Placement:
```javascript
const placement = new PlacementDefinition({
  tenantId: '...',
  slug: 'home_newsletter_popup',
  name: { tr: 'Anasayfa Newsletter', en: 'Home Newsletter' },
  category: 'popup',
  
  experiences: [{
    name: 'Default Newsletter Form',
    status: 'active',
    priority: 50,
    weight: 100,
    contentType: 'form',
    payload: { formId: '...' },
    ui: {
      variant: 'modal',
      width: 480,
      backdrop: true
    },
    rules: {
      paths: ['/'],
      trigger: { type: 'afterDelay', delay: 5000 },
      frequency: { maxPerDay: 1, capKey: 'newsletter' }
    }
  }]
});

await placement.save();
```

### 2. Get Eligible Experience (Decision Engine):
```javascript
const placement = await PlacementDefinition.findOne({
  tenantId,
  slug: 'home_newsletter_popup',
  status: 'active'
});

const eligible = placement.getEligibleExperiences({
  path: '/',
  locale: 'tr',
  device: 'desktop',
  authenticated: false
});

const selected = weightedRandom(eligible); // A/B selection
```

### 3. Track Events:
```javascript
// Impression
await PlacementEvent.trackEvent({
  tenantId,
  placementId: placement._id,
  experienceId: selected._id,
  type: 'impression',
  sessionId,
  path: '/',
  device: 'desktop'
});

// Conversion
await PlacementEvent.trackEvent({
  type: 'conversion',
  conversionGoal: 'formSubmit',
  conversionValue: 10,
  formId: '...'
});
```

---

## Next Steps

1. ✅ MongoDB Models Created
2. ⏳ Backend API Routes (decision + tracking endpoints)
3. ⏳ Decision Engine Service
4. ⏳ Analytics Service
5. ⏳ Frontend SDK (@contexthub/promo-sdk)
6. ⏳ Admin UI (Placement Builder)

---

## Dependencies

### Required npm packages:
```bash
pnpm add micromatch  # Path matching with glob patterns
```

### Already Available:
- mongoose
- crypto (Node.js built-in)

---

## File Structure

```
packages/common/src/models/
├── PlacementDefinition.js  ✅
├── PlacementEvent.js       ✅
└── index.js                ✅ (updated)
```
