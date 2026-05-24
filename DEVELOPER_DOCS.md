# ContextHub - Developer Documentation

> **Kapsamlı Geliştirici Dokümantasyonu**
> Multi-tenant Headless CMS ve İçerik Hizmetleri Platformu

---

## 📚 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Özellikler](#özellikler)
3. [Monorepo Yapısı](#monorepo-yapısı)
4. [Kurulum ve Başlangıç](#kurulum-ve-başlangıç)
5. [Deployment](#deployment)
6. [Mimari ve Tasarım](#mimari-ve-tasarım)
7. [Auth ve Tenant Yönetimi](#auth-ve-tenant-yönetimi)
8. [İçerik Sistemi](#içerik-sistemi)
9. [Form Sistemi](#form-sistemi)
10. [Menu Sistemi](#menu-sistemi)
11. [Placement Sistemi](#placement-sistemi)
12. [Koleksiyonlar](#koleksiyonlar)
13. [Medya Yönetimi](#medya-yönetimi)
14. [API Referansı](#api-referansı)
15. [Frontend SDK](#frontend-sdk)
16. [Güvenlik](#güvenlik)
17. [Performans](#performans)

---

## Genel Bakış

**ContextHub**, MERN stack ile geliştirilmiş, multi-tenant bir headless CMS ve içerik hizmetleri platformudur. WordPress'e bulut tabanlı, ölçeklenebilir bir alternatif sunmayı hedefler. Tek bir deployment ile birden fazla domain/tenant hizmet verebilir.

### Temel Özellikler

* **Multi-tenant by design** – Her tenant'ın kendi kullanıcıları, rolleri, içeriği ve konfigürasyonu vardır
* **Headless CMS** – İçerik JSON veya HTML olarak sunulur, Lexical editör desteği
* **Cloudflare R2 entegrasyonu** – Medya depolama ve CDN
* **RBAC** – Rol tabanlı erişim kontrolü (Owner, Admin, Editor, Author, Viewer)
* **Generic Forms** – Kod yazmadan özel formlar oluşturma
* **Analytics** – Sayfa görüntüleme ve olay takibi
* **API Tokens** – Fine-grained scope'lu servis entegrasyonu
* **Flexible Collections** – JSON schema tabanlı özel veri yapıları

---

## Özellikler

### ✅ Tamamlanan Özellikler

#### İçerik Yönetimi
- [x] Lexical JSON editör ile zengin içerik editörü
- [x] İçerik versiyonlama sistemi (snapshot'lar ile)
- [x] Kategori sistemi (hiyerarşik)
- [x] Taslak, zamanlanmış, yayınlanmış ve arşivlenmiş durum yönetimi
- [x] Slug otomatik oluşturma ve unique kontrolü
- [x] Featured media desteği
- [x] İçerik resim galerisi desteği

#### Medya Kütüphanesi
- [x] Cloudflare R2 entegrasyonu
- [x] Drag & drop upload
- [x] Otomatik image variant oluşturma (thumbnail, medium, large)
- [x] WebP format desteği
- [x] Metadata düzenleme (alt text, caption, tags)
- [x] Arama ve filtreleme
- [x] Bulk operations (tag assignment, delete)

#### Form Sistemi
- [x] Form builder (drag & drop - Phase 2)
- [x] 13 field tipi (text, email, phone, number, textarea, select, radio, checkbox, date, file, rating, hidden, section)
- [x] Çoklu dil desteği (TR/EN)
- [x] Conditional logic
- [x] Form versioning
- [x] Email notifications (dynamic recipients)
- [x] Webhook integration
- [x] CAPTCHA & honeypot desteği
- [x] Validation (Zod schemas)

#### Menu Sistemi
- [x] WordPress benzeri iç içe menu yapısı
- [x] 5 menu konumu (header, footer, sidebar, mobile, custom)
- [x] 6 menu item tipi (custom, external, page, category, content, form)
- [x] Parent-child ilişkileri
- [x] Max depth kontrolü
- [x] Public API endpoints

#### Placement Sistemi (CaaS)
- [x] Multi-experience placements
- [x] 15+ targeting rule (path, locale, device, browser, OS, auth, role, tags, cookies, referrer, schedule)
- [x] 8 UI variant (modal, banner-top, banner-bottom, slide-in-right, slide-in-left, corner-popup, fullscreen-takeover, inline)
- [x] A/B testing
- [x] Frequency capping
- [x] Analytics (impression, view, click, conversion)
- [x] React SDK (@contexthub/promo-sdk)

#### Tenant Yönetimi
- [x] Tenant settings (SMTP, webhook, branding, limits, feature flags)
- [x] Membership sistemi (multi-tenant users)
- [x] Role-based permissions
- [x] Tenant-level feature flags

#### Koleksiyonlar
- [x] JSON schema tabanlı custom collections
- [x] 8+ field tipi (string, number, boolean, date, ref, array, object, richtext)
- [x] Ref field autocomplete
- [x] Collection key autocomplete
- [x] Nested field desteği

---

## Monorepo Yapısı

ContextHub, **pnpm workspaces** kullanarak modüler bir monorepo yapısına sahiptir.

```
contextHub/
├── apps/
│   ├── api/              # Fastify backend servisi
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── services/ # Business logic
│   │   │   ├── middleware/ # Auth, tenant context
│   │   │   └── server.js # Fastify app
│   │   └── package.json
│   └── admin/            # React admin panel (Vite)
│       ├── src/
│       │   ├── pages/    # Page components
│       │   ├── components/ # Reusable components
│       │   ├── contexts/ # React contexts (Auth, etc.)
│       │   ├── lib/      # API clients, utilities
│       │   └── App.jsx
│       └── package.json
├── packages/
│   ├── common/           # Shared code
│   │   ├── src/
│   │   │   ├── models/   # MongoDB models
│   │   │   └── utils/    # Shared utilities
│   │   └── package.json
│   ├── promo-sdk/        # Placement SDK
│   │   ├── src/
│   │   │   ├── FrequencyManager.js
│   │   │   ├── tracking.js
│   │   │   ├── hooks/    # React hooks
│   │   │   └── components/ # React components
│   │   └── package.json
│   └── forms/            # Form renderer (planned)
├── scripts/              # Tooling helpers
├── docs/                 # Documentation
├── pnpm-workspace.yaml
├── package.json          # Root package
├── .env.example
└── README.md
```

### Shared Tooling

Tüm paketler root `package.json`'daki ortak araçları kullanır:
- **ESLint** – Kod kalitesi
- **Prettier** – Kod formatı
- **Vitest** – Test framework

---

## Kurulum ve Başlangıç

### Gereksinimler

- **Node.js** 18+ (production için Node 22 hedeflenir)
- **pnpm** (`npm install -g pnpm`)
- **MongoDB** (local veya cloud)
- **Cloudflare R2** (media storage için)

### Kurulum Adımları

```bash
# Repository'yi klonlayın
git clone <repo-url>
cd contextHub

# Bağımlılıkları yükleyin
pnpm install

# Environment variables'ı ayarlayın
cp .env.example .env
# .env dosyasını düzenleyin

# API sunucusunu başlatın
pnpm dev:api

# Admin panel'i başlatın (ayrı terminalde)
pnpm dev:admin
```

### Environment Variables

`.env` dosyası örneği:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/contexthub

# JWT
JWT_SECRET=your-secret-key-here

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=contexthub-media
R2_PUBLIC_DOMAIN=https://contextstore.ikon-x.com.tr
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com

# API
PORT=3000
NODE_ENV=development

# Admin Deploy (production)
adminUser=your-ssh-user
adminPassword=your-ssh-password
adminDeployPath=/path/to/deployment
adminDeployServer=your.server.com
```

### Development

```bash
# API server (port 3000)
pnpm dev:api

# Admin panel (port 5173)
cd apps/admin
pnpm dev

# Build tüm workspace
pnpm build

# Lint
pnpm lint

# Test
pnpm test
```

---

## Deployment

### Admin Panel Deployment

Admin panel'i production sunucusuna deploy etmek için:

```bash
# Build ve deploy (tek komut)
pnpm deploy

# Veya adım adım:
pnpm build:admin
pnpm deploy:admin
```

Deploy script şunları yapar:
1. SSH ile sunucuya bağlanır
2. Mevcut dosyaları yedekler
3. Yeni build'i yükler
4. Dosya izinlerini ayarlar

### API Deployment

API sunucusu için:

```bash
# Production build
cd apps/api
pnpm build

# PM2 ile çalıştırma
pm2 start dist/server.js --name contexthub-api

# Docker (opsiyonel)
docker build -t contexthub-api .
docker run -p 3000:3000 contexthub-api
```

Detaylı deployment bilgisi için: [DEPLOY.md](./DEPLOY.md)

---

## Mimari ve Tasarım

### Tech Stack

#### Backend
- **Fastify** – Hızlı ve düşük overhead web framework
- **MongoDB** + **Mongoose** – NoSQL database
- **JWT** – Authentication
- **Zod** – Schema validation
- **Cloudflare R2** – Object storage (S3-compatible)
- **Pino** – Logging

#### Frontend
- **React 18** – UI library
- **Vite** – Build tool
- **React Router** – Routing
- **React Query** – Server state management
- **Tailwind CSS** – Styling
- **Lexical** – Rich text editor
- **@dnd-kit** – Drag and drop
- **Heroicons** – Icon library

### Database Schema

#### Core Models

**User** – Kullanıcı hesapları
```javascript
{
  email: String,
  passwordHash: String,
  name: String,
  status: String, // active, suspended
  createdAt: Date
}
```

**Tenant** – Organizasyonlar
```javascript
{
  name: String,
  slug: String, // unique
  domain: String,
  status: String, // active, suspended
  createdAt: Date
}
```

**Membership** – Kullanıcı-Tenant ilişkileri
```javascript
{
  userId: ObjectId,
  tenantId: ObjectId,
  role: String, // owner, admin, editor, author, viewer
  status: String, // active, suspended
  createdAt: Date
}
```

**Content** – İçerik yönetimi (detay: [İçerik Sistemi](#içerik-sistemi))

**Form** – Form tanımları (detay: [Form Sistemi](#form-sistemi))

**Menu** – Menu yapısı (detay: [Menu Sistemi](#menu-sistemi))

**PlacementDefinition** – Placement yapılandırmaları (detay: [Placement Sistemi](#placement-sistemi))

---

## Auth ve Tenant Yönetimi

### Authentication Flow

1. **Login**: `POST /api/auth/login`
   - Email/password doğrulama
   - Tüm membership'ler için tenant-specific JWT oluşturma
   - Token + tenant bilgisi dönülür

2. **Token Storage**: Admin UI
   - `localStorage` kullanılır
   - `token`, `tenantId`, membership metadata saklanır

3. **Request Headers**:
   - `Authorization: Bearer <jwt>`
   - `X-Tenant-ID: <tenant-id>`
   - Query param: `?tenantId=<tenant-id>`

### Middleware Flow

```javascript
// API request'i alınır
→ tenantContext middleware (X-Tenant-ID'yi resolve eder)
→ authenticate middleware (JWT'yi verify eder, membership kontrolü)
→ Route handler (tenant-scoped data)
```

### Tenant Selection

Kullanıcı birden fazla tenant'a üye olabilir:
- Login'de tüm membership'ler listelenir
- Admin UI'da tenant picker ile değiştirilebilir
- Her tenant switch'te yeni JWT alınır

### Role-Based Access Control (RBAC)

**Roller:**
- **Owner** – Tam yetki (tenant settings, billing, delete tenant)
- **Admin** – İdari işlemler (kullanıcı yönetimi, tüm içerik erişimi)
- **Editor** – İçerik yönetimi (create, edit, publish, delete)
- **Author** – İçerik oluşturma (create, edit kendi içeriği)
- **Viewer** – Sadece okuma

**Permission Kontrolü:**

```javascript
// Middleware
authenticate({ role: 'editor' }) // En az editor gerekir

// Service layer
if (!canEditContent(user, content)) {
  throw new Error('Unauthorized');
}
```

---

## İçerik Sistemi

### Özellikler

- **Lexical Editor** – Zengin metin editörü (Google Docs benzeri)
- **Versioning** – Immutable snapshot'lar
- **Workflow States** – draft, scheduled, published, archived
- **Categories** – Hiyerarşik kategori sistemi
- **Tags** – İçerik etiketleme
- **Featured Media** – Öne çıkan görsel
- **Galleries** – İçeriğe bağlı galeri desteği
- **Slug Management** – Otomatik slug oluşturma, uniqueness kontrolü
- **Scheduling** – Gelecek tarihe yayınlama

### Content Model

```javascript
{
  tenantId: ObjectId,
  title: String,
  slug: String, // unique per tenant
  summary: String,
  lexical: Object, // Lexical editor JSON
  html: String, // Rendered HTML
  categories: [ObjectId],
  tags: [String],
  featuredMediaId: ObjectId,
  galleries: [ObjectId],
  status: String, // draft, scheduled, published, archived
  publishAt: Date,
  publishedAt: Date,
  publishedBy: ObjectId,
  version: Number,
  lastVersionId: ObjectId,
  authorName: String,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

### Lexical Editor Features

#### Temel Formatlama
- **Başlıklar** – H1, H2, H3
- **Text Styles** – Bold, Italic, Underline, Strikethrough
- **Lists** – Bullet, Numbered (nested)
- **Alignment** – Left, Center, Right
- **Font Size** – Ayarlanabilir (default: 12px)
- **Colors** – Text color, Background color

#### Gelişmiş Özellikler
- **Images** – Upload, resize, align (left/center/right), caption
- **Tables** – Google Docs style, resize columns, row operations
- **Code Blocks** – Syntax highlighting
- **Links** – URL insertion
- **Blockquotes** – Alıntılar

#### Editor Toolbar

```
┌─────────────────────────────────────────────────────────┐
│ [H1▼] [Aa▼] [B] [I] [U] [S] [≡] [•] [1.] [</>] [...] │
│ Undo Redo | Font Color | BG Color | Image | Table     │
└─────────────────────────────────────────────────────────┘
```

### Content API

```javascript
// List contents
GET /api/contents?status=published&category=news&page=1&limit=20

// Get single content
GET /api/contents/:id

// Create content
POST /api/contents
{
  title: "New Article",
  summary: "Brief description",
  lexical: {...},
  html: "<p>...</p>",
  categories: ["cat-id"],
  tags: ["tech", "news"],
  status: "draft"
}

// Update content (creates new version)
PUT /api/contents/:id

// Delete content
DELETE /api/contents/:id

// Version history
GET /api/contents/:id/versions
```

### Versioning System

Her content update'i yeni bir `ContentVersion` snapshot'ı oluşturur:

```javascript
{
  tenantId: ObjectId,
  contentId: ObjectId,
  version: Number,
  title: String,
  slug: String,
  lexical: Object,
  html: String,
  status: String,
  // ... tüm content fields
  createdBy: ObjectId,
  createdAt: Date
}
```

**Version Recovery** (planned):
```javascript
POST /api/contents/:id/restore/:version
```

---

## Form Sistemi

### Mimari

Form sistemi 3 ana bileşenden oluşur:
1. **Form Builder** (Admin UI) – Drag & drop form oluşturma
2. **Form Backend** (API) – CRUD, validation, submission handling
3. **Form Renderer** (SDK) – Public form gösterimi

### Form Definition Model

```javascript
{
  tenantId: ObjectId,
  title: { tr: String, en: String }, // i18n
  slug: String, // unique per tenant
  description: { tr: String, en: String },

  // Form yapısı
  fields: [{
    id: String, // UUID
    type: String, // text, email, phone, number, select, radio, checkbox, date, file, rating, hidden, textarea, section
    name: String, // field name (form submission key)
    label: { tr: String, en: String },
    placeholder: { tr: String, en: String },
    helpText: { tr: String, en: String },
    required: Boolean,
    validation: {
      min: Number,
      max: Number,
      pattern: String,
      fileTypes: [String],
      maxFileSize: Number
    },
    options: [{ value: String, label: Object }],
    conditionalLogic: {
      field: String, // field id
      operator: String, // equals, notEquals, contains, greaterThan, lessThan
      value: Mixed
    },
    defaultValue: Mixed,
    settings: Object // field-specific settings
  }],

  // Durum
  status: String, // draft, published, archived
  version: Number,
  lastVersionId: ObjectId,

  // Ayarlar
  settings: {
    submitButtonText: { tr: String, en: String },
    successMessage: { tr: String, en: String },
    redirectUrl: String,
    enableCaptcha: Boolean,
    enableHoneypot: Boolean,
    allowMultipleSubmissions: Boolean,
    submitLimit: Number,
    enableAuthentication: Boolean, // require login

    // Email notifications
    enableEmailNotifications: Boolean,
    emailNotifications: {
      recipients: [String], // emails or {field:fieldId}
      replyTo: String,
      subject: { tr: String, en: String },
      emailTemplate: { tr: String, en: String }
    },

    // Webhooks
    enableWebhooks: Boolean,
    webhooks: [{
      url: String,
      events: [String], // submit, update, delete
      headers: Object
    }],

    // File uploads
    fileUpload: {
      maxFileSize: Number, // MB
      allowedTypes: [String]
    },

    // Data collection
    collectGeo: Boolean,
    collectDevice: Boolean
  },

  // Metadata
  submissionCount: Number,
  lastSubmissionAt: Date,

  createdBy: ObjectId,
  updatedBy: ObjectId,
  publishedBy: ObjectId,
  publishedAt: Date
}
```

### Form Response Model

```javascript
{
  tenantId: ObjectId,
  formId: ObjectId,
  formVersion: Number,

  // Submission data
  data: Object, // { fieldName: value }
  files: [{
    fieldId: String,
    mediaId: ObjectId,
    filename: String,
    size: Number,
    mimeType: String
  }],

  // Metadata
  source: String, // web, mobile, api
  locale: String,
  userAgent: String,
  ip: String, // hashed
  geo: {
    country: String,
    city: String,
    coordinates: [Number]
  },
  referrer: String,

  // User identification
  userId: ObjectId, // if authenticated
  userEmail: String,

  // Processing
  status: String, // pending, processed, spam
  flaggedAsSpam: Boolean,
  spamScore: Number,

  createdAt: Date,
  processedAt: Date
}
```

### Form Builder UI

**3 Ana Tab:**

1. **Form Oluştur (Build)**
   - Field palette (drag to add)
   - Form canvas (reorder fields)
   - Field inspector (edit properties)

2. **Ayarlar (Settings)**
   - Genel ayarlar (title, slug, status)
   - Submit button & success message
   - Security (CAPTCHA, honeypot)
   - Email notifications
   - Webhooks
   - File upload settings

3. **Önizleme (Preview)**
   - Form preview (planned)
   - Test submission

**Field Inspector Tabs:**
- **Temel** – Label, placeholder, help text (multi-language)
- **Doğrulama** – Required, min/max, pattern, file types
- **Gelişmiş** – Conditional logic, default value

### Field Types

| Type | Description | Validation |
|------|-------------|------------|
| text | Single-line text | min/max length, pattern |
| email | Email input | email format |
| phone | Phone number | phone format |
| number | Numeric input | min/max value |
| textarea | Multi-line text | min/max length |
| select | Dropdown | required, options |
| radio | Radio buttons | required, options |
| checkbox | Checkboxes | required, options |
| date | Date picker | min/max date |
| file | File upload | fileTypes, maxFileSize |
| rating | Star rating | min/max rating |
| hidden | Hidden field | - |
| section | Visual separator | - |

### Form API

```javascript
// Admin endpoints
GET    /api/forms                           // List forms
POST   /api/forms                           // Create form
GET    /api/forms/:id                       // Get form
PUT    /api/forms/:id                       // Update form
DELETE /api/forms/:id                       // Delete form
POST   /api/forms/:id/publish               // Publish form
POST   /api/forms/:id/archive               // Archive form
POST   /api/forms/:id/duplicate             // Duplicate form
GET    /api/forms/:id/versions              // Version history
POST   /api/forms/:id/restore/:version      // Restore version
GET    /api/forms/check-slug?slug=contact   // Check slug availability

// Public endpoints
GET    /api/public/forms/:tenantSlug/:formSlug        // Get published form
POST   /api/public/forms/:tenantSlug/:formSlug/submit // Submit form

// Response management
GET    /api/forms/:id/responses             // List responses
GET    /api/forms/:id/responses/:responseId // Get response
DELETE /api/forms/:id/responses/:responseId // Delete response
POST   /api/forms/:id/responses/export      // Export CSV/XLSX
POST   /api/forms/:id/responses/bulk        // Bulk operations

// Analytics
GET    /api/forms/:id/analytics             // Form analytics
```

### Dynamic Email Recipients

Form submission notification'ları dinamik alıcılara gönderilebilir:

**Static Email:**
```javascript
recipients: ["admin@example.com", "support@example.com"]
```

**Dynamic Field Reference:**
```javascript
recipients: ["{field:email_field_id}", "admin@example.com"]
```

Form submit edildiğinde:
1. `{field:email_field_id}` → kullanıcının girdiği email adresi
2. Email notification her iki alıcıya gönderilir

### Validation (Zod)

Form validation Zod schema ile yapılır:

```javascript
// Backend validation
const formSchema = z.object({
  title: z.object({
    tr: z.string().min(1, 'Form başlığı boş bırakılamaz'),
    en: z.string().optional()
  }),
  fields: z.array(z.object({
    name: z.string().min(1, 'Alan adı boş bırakılamaz'),
    type: z.enum([...]),
    label: z.object({...}),
    // ...
  }))
});

// Frontend error display
{
  "error": "ValidationFailed",
  "message": "Formda hata var. Lütfen kontrol edin.",
  "details": [
    {
      "path": ["title"],
      "message": "Form başlığı boş bırakılamaz"
    }
  ]
}
```

### Form Security

- **CAPTCHA** – Google reCAPTCHA / hCaptcha
- **Honeypot** – Hidden field spam trap
- **Rate Limiting** – 5 submission/minute per IP
- **Input Sanitization** – DOMPurify
- **CSRF Protection** – Token validation
- **IP Hashing** – GDPR compliance

---

## Menu Sistemi

### Özellikler

- WordPress benzeri iç içe menu yapısı
- Unlimited depth (önerilen max: 3)
- 5 menu konumu
- 6 menu item tipi
- Public API endpoints

### Menu Model

```javascript
{
  tenantId: ObjectId,
  name: String, // "Ana Menü"
  slug: String, // "ana-menu" (unique per tenant)
  description: String,
  location: String, // header, footer, sidebar, mobile, custom
  status: String, // active, draft, archived

  items: [{
    title: String,
    type: String, // custom, external, page, category, content, form
    url: String,
    reference: {
      model: String,
      id: ObjectId
    },
    target: String, // _self, _blank
    cssClasses: String,
    icon: String,
    description: String,
    parentId: ObjectId,
    order: Number,
    isVisible: Boolean,
    children: [ObjectId]
  }],

  meta: {
    totalItems: Number,
    maxDepth: Number,
    lastModifiedBy: ObjectId
  }
}
```

### Menu Konumları

```javascript
{
  header: 'Üst Menü',      // Site header
  footer: 'Alt Menü',      // Site footer
  sidebar: 'Yan Menü',     // Sidebar
  mobile: 'Mobil Menü',    // Mobile hamburger
  custom: 'Özel'           // Custom placement
}
```

### Menu Item Tipleri

```javascript
{
  custom: 'Özel URL',      // Internal: /about
  external: 'Harici Link', // External: https://example.com
  page: 'Sayfa',           // Page reference
  category: 'Kategori',    // Category reference
  content: 'İçerik',       // Content reference
  form: 'Form'             // Form reference
}
```

### Menu API

```javascript
// Admin endpoints
GET    /api/menus                          // List menus
POST   /api/menus                          // Create menu
GET    /api/menus/:id                      // Get menu
GET    /api/menus/:id/tree                 // Get tree structure
PUT    /api/menus/:id                      // Update menu
DELETE /api/menus/:id                      // Delete menu
POST   /api/menus/:id/duplicate            // Duplicate menu

// Menu items
POST   /api/menus/:id/items                // Add item
PUT    /api/menus/:id/items/:itemId        // Update item
DELETE /api/menus/:id/items/:itemId        // Delete item (recursive)
POST   /api/menus/:id/reorder              // Reorder items
POST   /api/menus/:id/items/:itemId/move   // Move item

// Public endpoints
GET    /api/public/menus/location/:location // Get by location
GET    /api/public/menus/slug/:slug         // Get by slug
```

### Frontend Kullanımı

```javascript
// Menu çekme
const response = await fetch('/api/public/menus/location/header', {
  headers: { 'X-Tenant-ID': tenantId }
});

const { tree } = await response.json();

// Tree structure:
[
  {
    title: 'Ana Sayfa',
    url: '/',
    children: []
  },
  {
    title: 'Ürünler',
    url: '/products',
    children: [
      {
        title: 'Kategori 1',
        url: '/products/category-1',
        children: []
      }
    ]
  }
]
```

**React Component Örneği:**

```jsx
function Navigation({ menuSlug }) {
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    fetch(`/api/public/menus/slug/${menuSlug}`, {
      headers: { 'X-Tenant-ID': tenantId }
    })
    .then(res => res.json())
    .then(data => setMenu(data.tree));
  }, [menuSlug]);

  const renderMenu = (items) => (
    <ul>
      {items.map(item => (
        <li key={item._id} className={item.cssClasses}>
          <a href={item.url} target={item.target}>
            {item.title}
          </a>
          {item.children?.length > 0 && renderMenu(item.children)}
        </li>
      ))}
    </ul>
  );

  return menu ? renderMenu(menu) : null;
}
```

---

## Placement Sistemi

### Özellikler

Placement sistemi, Content-as-a-Service (CaaS) yaklaşımıyla popup, banner, inline content yönetimi sunar.

**Temel Özellikler:**
- Multi-experience placements (A/B testing)
- 15+ targeting rule
- 8 UI variant
- 6 content type
- Frequency capping
- Analytics & conversion tracking
- React SDK

### PlacementDefinition Model

```javascript
{
  tenantId: ObjectId,
  name: String,
  slug: String,
  description: String,
  status: String, // active, paused, archived

  experiences: [{
    name: String,
    weight: Number, // A/B testing weight

    // Content
    content: {
      type: String, // text_cta, html, image, video, form, component
      data: Object
    },

    // Targeting
    targeting: {
      paths: [String], // glob patterns
      queryParams: Object,
      locales: [String],
      devices: [String],
      browsers: [String],
      os: [String],
      requireAuth: Boolean,
      roles: [String],
      userTags: [String],
      featureFlags: [String],
      cookies: [{
        name: String,
        operator: String, // exists, equals, contains, etc.
        value: String
      }],
      referrer: String // glob pattern
    },

    // UI Configuration
    ui: {
      variant: String, // modal, banner-top, banner-bottom, slide-in-right, slide-in-left, corner-popup, fullscreen-takeover, inline
      position: String,
      width: String,
      height: String,
      backgroundColor: String,
      textColor: String,
      buttonColor: String,
      borderRadius: String,
      padding: String,
      zIndex: Number,
      offset: { x: Number, y: Number },
      showCloseButton: Boolean,
      showOverlay: Boolean,
      closeOnOverlayClick: Boolean,
      animation: String,
      trigger: {
        type: String, // onLoad, onScroll, onExit, onTimeout, manual
        delay: Number,
        scrollDepth: Number
      }
    },

    // Schedule
    schedule: {
      startDate: Date,
      endDate: Date,
      daysOfWeek: [Number],
      hoursOfDay: { start: Number, end: Number },
      timezone: String
    },

    // Frequency
    frequency: {
      sessionLimit: Number,
      dailyLimit: Number,
      totalLimit: Number,
      cooldownMinutes: Number
    },

    // Goals
    conversionGoals: [{
      id: String,
      name: String,
      type: String, // click, submit, custom
      value: Number
    }]
  }],

  // Stats
  impressions: Number,
  views: Number,
  clicks: Number,
  conversions: Number,

  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

### UI Variants

```javascript
{
  'modal': 'Modal (centered overlay)',
  'banner-top': 'Top Banner',
  'banner-bottom': 'Bottom Banner',
  'slide-in-right': 'Right Sidebar Slide-in',
  'slide-in-left': 'Left Sidebar Slide-in',
  'corner-popup': 'Bottom-right Corner Popup',
  'fullscreen-takeover': 'Fullscreen Overlay',
  'inline': 'Inline Content (relative positioning)'
}
```

### Targeting Rules

15+ targeting kuralı:

1. **Paths** – URL pattern matching (glob: `/products/**`)
2. **Query Parameters** – URL query string
3. **Locales** – Language/region (en, tr, de, fr, es, it)
4. **Devices** – desktop, mobile, tablet
5. **Browsers** – chrome, firefox, safari, edge, opera
6. **Operating Systems** – windows, macos, linux, ios, android
7. **Authentication** – Logged in / Guest
8. **Roles** – User roles
9. **User Tags** – Custom tags
10. **Feature Flags** – Feature flag matching
11. **Cookies** – Cookie rules (8 operators)
12. **Referrer** – Referrer URL pattern
13. **Schedule** – Date range, days, hours, timezone
14. **Frequency Cap** – Session/daily/total limits
15. **A/B Testing** – Weight-based distribution

### Event Tracking

**8 Event Tipi:**
```javascript
{
  impression: 'Placement loaded',
  view: 'Placement visible (50%+ viewport)',
  click: 'User clicked',
  conversion: 'Goal completed',
  close: 'Placement closed',
  dismiss: 'Placement dismissed',
  submit: 'Form submitted',
  error: 'Error occurred'
}
```

**Metrics:**
- View Rate = (views / impressions) × 100
- Click Rate (CTR) = (clicks / impressions) × 100
- Conversion Rate (CVR) = (conversions / impressions) × 100

### Placement API

```javascript
// Admin endpoints
GET    /api/placements                           // List
POST   /api/placements                           // Create
PUT    /api/placements/:id                       // Update
DELETE /api/placements/:id                       // Delete
POST   /api/placements/:id/archive               // Archive
POST   /api/placements/:id/duplicate             // Duplicate
POST   /api/placements/:id/experiences           // Add experience
PUT    /api/placements/:id/experiences/:expId    // Update experience
DELETE /api/placements/:id/experiences/:expId    // Delete experience
POST   /api/placements/debug-decision            // Explain draft/saved placement eligibility

// Public endpoints
POST   /api/public/placements/decide             // Get placement decision
GET    /api/public/placements/:slug              // Get active placement details
POST   /api/public/placements/decide-batch       // Batch decisions
POST   /api/public/placements/event              // Track event
POST   /api/public/placements/events/batch       // Batch events

// Analytics
GET    /api/placements/:id/stats/totals          // Total metrics
GET    /api/placements/:id/stats                 // Time series
GET    /api/placements/:id/experiences/:expId/funnel // Conversion funnel
GET    /api/placements/:id/ab-test               // A/B test results
GET    /api/placements/:id/stats/devices         // Device breakdown
GET    /api/placements/:id/stats/browsers        // Browser breakdown
GET    /api/placements/:id/stats/top-pages       // Top pages
GET    /api/placements/:id/stats/realtime        // Real-time stats
GET    /api/placements/journey                   // User journey
```

### Placement Builder UX

Admin placement editing is organized as a builder workflow:

- **Kanal**: popup, banner, inline, custom view, fullscreen, toast/mobile notification prompt.
- **İçerik**: text, custom HTML, image, video, ContextHub form, component, external URL.
- **Davranış**: trigger, targeting, schedule, frequency caps, conversion goals.

The edit page includes a right-side Placement Workbench:

- **Preview**: desktop/mobile toggle, light/dark background, trigger simulation, form dry-run, SDK JSON.
- **Debug**: sends draft placement + test context to `POST /api/placements/debug-decision`.
- **Webhooks**: reads `GET /api/admin/tenants/:tenantId/webhooks/queue` for domain event/outbox visibility.

Debug request:

```json
{
  "placement": { "slug": "welcome-popup", "experiences": [] },
  "context": {
    "path": "/pricing",
    "locale": "tr",
    "device": "desktop",
    "sessionId": "admin-preview-session",
    "userTags": ["returning"],
    "featureFlags": ["new-pricing"],
    "seenCaps": {}
  }
}
```

Debug responses include `selected`, `eligible`, `rejected`, `evaluated`, and `summary`. Rejection reasons include codes such as `path_mismatch`, `locale_mismatch`, `feature_flag_missing`, `schedule_inactive`, and `frequency_capped`.

### Frontend SDK (@contexthub/promo-sdk)

**React Kullanımı:**

```jsx
import { initTracker, PlacementHost } from '@contexthub/promo-sdk';

// Initialize once
initTracker({
  apiUrl: 'https://api.example.com/api/public/placements',
  tenantId: 'your-tenant-id',
  apiKey: 'ctx_optional_public_token'
});

// Use component
<PlacementHost
  placementSlug="welcome-popup"
  autoTrack={true}
  onConversion={(goalId, value) => {
    console.log('Conversion:', goalId, value);
  }}
/>
```

**Vanilla JS:**

```javascript
<script src="https://cdn.example.com/contexthub-placement.js"></script>
<script>
  const placement = new ContextHubPlacement({
    apiUrl: 'https://api.example.com',
    tenantId: 'tenant-id',
    placementSlug: 'welcome-popup'
  });

  placement.load();
</script>
```

**SDK Features:**
- Frequency capping (localStorage)
- Event batching (10 events, 5s flush)
- Offline queue
- Intersection Observer (view tracking)
- Auto-tracking

---

## Koleksiyonlar

### Özellikler

JSON schema tabanlı custom data structures.

**Field Tipleri:**
- string, number, boolean, date
- ref (referans), array, object
- richtext (Lexical JSON)

### Collection Model

```javascript
{
  tenantId: ObjectId,
  key: String, // unique per tenant
  name: { tr: String, en: String },
  description: { tr: String, en: String },
  status: String, // active, draft, archived

  fields: [{
    key: String,
    type: String,
    label: { tr: String, en: String },
    helpText: { tr: String, en: String },
    required: Boolean,
    unique: Boolean,
    defaultValue: Mixed,
    validation: Object,
    settings: Object,

    // Ref field
    ref: String, // target collection key
    refTarget: String, // same as ref

    // Array/Object
    items: Object, // nested schema
    properties: Object // nested schema
  }],

  // Indexes
  indexes: [{
    fields: Object,
    options: Object
  }],

  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

### Collection Entry Model

```javascript
{
  tenantId: ObjectId,
  collectionKey: String,

  data: Object, // User-defined data matching collection schema

  // Metadata
  status: String, // active, archived
  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

### Ref Field Autocomplete

Collection entry oluştururken ref field'lar için akıllı autocomplete:

**Özellikler:**
- Hedef koleksiyondan kayıt arama
- Gerçek zamanlı filtreleme
- Çoklu seçim desteği (`settings.multiple: true`)
- Entry başlık gösterimi (title/name/baslik field'ı)

**Component:**

```jsx
<RefFieldAutocomplete
  refTarget="donem"              // Hedef koleksiyon
  value={selectedId}             // Seçili ID (veya ID array)
  onChange={(newValue) => {...}}
  multiple={false}
  placeholder="Aramaya başlayın..."
/>
```

### Collection Key Autocomplete

Collection tanımlarken ref field için hedef koleksiyon seçimi:

**Özellikler:**
- Aktif koleksiyonları listeler
- Arama ile filtreleme
- Self-reference engelleme
- Manuel key girişi desteği

**Component:**

```jsx
<CollectionKeyAutocomplete
  value={field.refTarget}
  onChange={(newValue) => {...}}
  excludeKey={currentCollectionKey}
  placeholder="Hedef koleksiyon seçin"
/>
```

### Collection API

```javascript
// Collection types
GET    /api/collections                     // List collections
POST   /api/collections                     // Create collection
GET    /api/collections/:key                // Get collection
PUT    /api/collections/:key                // Update collection
DELETE /api/collections/:key                // Delete collection

// Collection entries
GET    /api/collections/:key/entries        // List entries
POST   /api/collections/:key/entries        // Create entry
GET    /api/collections/:key/entries/:id    // Get entry
PUT    /api/collections/:key/entries/:id    // Update entry
DELETE /api/collections/:key/entries/:id    // Delete entry

// Bulk operations
POST   /api/collections/:key/entries/bulk   // Bulk create
PUT    /api/collections/:key/entries/bulk   // Bulk update
DELETE /api/collections/:key/entries/bulk   // Bulk delete
```

---

## Medya Yönetimi

### Özellikler

- Cloudflare R2 entegrasyonu (S3-compatible)
- Presigned URL upload
- Otomatik image variant oluşturma
- WebP format desteği
- Metadata yönetimi
- Arama ve filtreleme
- Bulk operations

### Media Model

```javascript
{
  tenantId: ObjectId,
  tenantSlug: String, // Snapshot for CDN URL

  // File info
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number, // bytes
  extension: String,

  // R2 storage
  r2Key: String, // Full R2 object key
  r2Path: String, // Path within tenant
  publicUrl: String, // CDN URL

  // Image variants
  variants: [{
    name: String, // thumbnail, medium, large
    width: Number,
    height: Number,
    format: String, // webp
    size: Number,
    r2Key: String,
    publicUrl: String
  }],

  // Metadata
  alt: String,
  caption: String,
  tags: [String],
  description: String,

  // Status
  status: String, // active, archived

  uploadedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

### Image Variants

Otomatik oluşturulan varyantlar:

```javascript
{
  thumbnail: { width: 150, format: 'webp' },
  medium: { width: 640, format: 'webp' },
  large: { width: 1280, format: 'webp' }
}
```

### Media API

```javascript
// List media
GET /api/media?type=image&tags=banner&search=logo&page=1&limit=20

// Presigned upload URL
POST /api/media/presign
{
  filename: "image.jpg",
  mimeType: "image/jpeg",
  size: 1024000
}
Response: { uploadUrl, mediaId }

// Complete upload (process variants)
POST /api/media/:id/complete

// Get media
GET /api/media/:id

// Update metadata
PUT /api/media/:id
{
  alt: "Alt text",
  caption: "Caption",
  tags: ["banner", "homepage"]
}

// Delete media
DELETE /api/media/:id

// Bulk operations
POST /api/media/bulk/tag       // Add tags
DELETE /api/media/bulk/delete  // Delete multiple
```

### Upload Flow

**Client-side:**

```javascript
// 1. Request presigned URL
const { uploadUrl, mediaId } = await fetch('/api/media/presign', {
  method: 'POST',
  body: JSON.stringify({
    filename: file.name,
    mimeType: file.type,
    size: file.size
  })
}).then(r => r.json());

// 2. Upload to R2
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type
  }
});

// 3. Complete upload (trigger variant generation)
await fetch(`/api/media/${mediaId}/complete`, {
  method: 'POST'
});
```

### CDN URLs

```
// Original
https://contextstore.ikon-x.com.tr/{tenantSlug}/media/{path}/{filename}

// Variant
https://contextstore.ikon-x.com.tr/{tenantSlug}/media/{path}/variants/{variant}/{filename}
```

---

## API Referansı

### Swagger UI

API dokümantasyonu `/docs` endpoint'inde Swagger UI ile sunulur.

**Erişim:**
```
http://localhost:3000/docs
```

**OpenAPI Spec:**
- Title: "ContextHub API"
- Version: 0.1.0
- Security: JWT Bearer + X-Tenant-ID header

### Authentication

**Request Headers:**

```http
Authorization: Bearer <jwt-token>
X-Tenant-ID: <tenant-id>
```

### Response Format

**Success:**

```json
{
  "data": {...},
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

**Error:**

```json
{
  "error": "ErrorCode",
  "message": "Human-readable message",
  "details": [...]
}
```

### Rate Limiting

- Admin endpoints: 1000 req/hour per user
- Public endpoints: 100 req/hour per IP
- Form submissions: 5 req/minute per IP

---

## Frontend SDK

### @contexthub/promo-sdk

Placement sistemi için React/Vanilla JS SDK.

**Kurulum:**

```bash
npm install @contexthub/promo-sdk
```

**React:**

```jsx
import { initTracker, PlacementHost, usePlacement } from '@contexthub/promo-sdk';

// Initialize
initTracker({
  apiUrl: 'https://api.example.com/api/public/placements',
  tenantId: 'tenant-id',
  apiKey: 'ctx_optional_public_token'
});

// Component
<PlacementHost
  placementSlug="welcome-popup"
  autoTrack={true}
/>

// Hook
function MyComponent() {
  const { decision, loading, trackClick } = usePlacement({
    placementSlug: 'welcome-popup',
    autoTrack: true
  });

  return (
    <div>
      {decision && (
        <div onClick={trackClick}>
          {decision.content.title}
        </div>
      )}
    </div>
  );
}
```

**Vanilla JS:**

```html
<div id="placement"></div>
<script src="https://cdn.example.com/contexthub-placement.js"></script>
<script>
  const placement = new ContextHubPlacement({
    apiUrl: 'https://api.example.com/api/public/placements',
    tenantId: 'tenant-id',
    apiKey: 'ctx_optional_public_token',
    placementSlug: 'welcome-popup',
    container: '#placement',
    autoTrack: true
  });

  placement.load();
</script>
```

### Features

- **FrequencyManager** – Client-side frequency capping (localStorage)
- **Event Tracking** – Batch processing, offline queue
- **Intersection Observer** – View tracking
- **Auto-tracking** – Impression, view, click events
- **8 UI Variants** – Modal, banner, slide-in, etc.
- **5 Triggers** – onLoad, onScroll, onExit, onTimeout, manual. If the component `trigger` prop is omitted, the backend placement trigger is used.

**Form Placements:**

When an experience uses `contentType: 'form'`, the admin editor stores the selected ContextHub form in `payload.formId`. Public decision/detail responses resolve the form into renderer-ready fields and include `content.submitEndpoint`, which targets `POST /api/public/forms/:formId/submit`.

---

## Güvenlik

### Authentication & Authorization

- **JWT** – Token-based auth (HS256)
- **Token expiry** – 7 days (configurable)
- **Refresh tokens** – Not implemented (planned)
- **RBAC** – Role-based access control

### Input Validation

- **Zod schemas** – Server-side validation
- **DOMPurify** – XSS prevention (HTML sanitization)
- **Mongoose schemas** – Database validation

### Data Privacy

- **GDPR Compliance**:
  - IP hashing
  - Event TTL (90 days)
  - User consent tracking
  - Right to deletion
- **Tenant Isolation** – Strict tenant-scoped queries
- **Password Hashing** – bcrypt (12 rounds)
- **Secrets Encryption** – Tenant settings (SMTP passwords, API keys)

### Security Headers

```javascript
// Fastify Helmet
helmet({
  contentSecurityPolicy: false, // Configured separately
  hsts: { maxAge: 31536000 }
})
```

### Rate Limiting

- **API endpoints** – IP-based throttling
- **Form submissions** – 5 req/minute per IP per form
- **Login attempts** – 5 failed attempts → 15 min lockout

### File Uploads

- **Size limits** – 100 MB per file
- **Type validation** – MIME type whitelist
- **Virus scanning** – Planned (ClamAV integration)
- **Presigned URLs** – Time-limited (15 minutes)

---

## Performans

### Database

- **Indexes** – Strategic indexing on frequent queries
- **Compound indexes** – `{ tenantId: 1, status: 1, createdAt: -1 }`
- **Pagination** – Limit queries to 100 items max
- **Aggregations** – Pipeline optimization

### Caching

- **React Query** – Client-side cache (staleTime: 5 minutes)
- **Redis** (planned) – Server-side cache for:
  - Public API responses
  - Placement decisions
  - Menu structures

### API

- **Fastify** – Low overhead, high throughput
- **Streaming** – Large file uploads/downloads
- **Compression** – gzip/brotli
- **Connection pooling** – MongoDB connection pool

### Frontend

- **Code splitting** – Route-based chunks
- **Lazy loading** – Dynamic imports
- **Image optimization** – WebP, variants, lazy loading
- **Bundle size** – <200 KB main chunk

### Monitoring

- **Pino logger** – Structured logging
- **Performance metrics** – Request duration, DB queries
- **Error tracking** – Planned (Sentry integration)

---

## Katkıda Bulunma

### Development Workflow

```bash
# Feature branch oluştur
git checkout -b feature/new-feature

# Kod yaz, test et
pnpm test
pnpm lint

# Commit (conventional commits)
git commit -m "feat: add new feature"

# Push ve PR aç
git push origin feature/new-feature
```

### Conventional Commits

```
feat: Yeni özellik
fix: Bug düzeltmesi
docs: Dokümantasyon değişikliği
style: Kod formatı (functionality değişmiyor)
refactor: Kod refactor
test: Test ekleme/düzeltme
chore: Build/config değişiklikleri
```

### Code Style

- **ESLint** – `.eslintrc.cjs`
- **Prettier** – Otomatik format
- **File naming** – camelCase (JS), kebab-case (CSS)

### Testing

```bash
# Unit tests
pnpm test

# Coverage
pnpm test:coverage

# E2E tests (planned)
pnpm test:e2e
```

---

## Lisans

MIT License

---

## Destek ve İletişim

- **GitHub Issues** – Bug reports, feature requests
- **Email** – support@contexthub.com (if available)
- **Documentation** – https://docs.contexthub.com (if available)

---

**Son Güncelleme:** 17 Ekim 2025

**Doküman Versiyonu:** 1.0.0
