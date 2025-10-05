# Codex Notes

## Monorepo Outline
- `apps/api`: Fastify service exposing REST routes. Key folders include `routes/` for HTTP endpoints, `services/` for business logic, and `middleware/` for auth and tenant resolution.
- `apps/admin`: React admin console bootstrapped with Vite. Uses React Router for navigation, React Query for data fetching, and Tailwind for styling. Auth state lives in `src/contexts/AuthContext.jsx` and persists tokens plus tenant info in `localStorage`.
- `packages/common`: Shared MongoDB models (e.g. `User`, `Membership`, `Tenant`, content models) and utilities used by both the API and background jobs.

## Auth and Tenant Selection Flow
- Login (`POST /auth/login`) validates credentials, builds a tenant-specific JWT per membership, and either activates the chosen tenant or flags that selection is required.
- The admin UI stores `token`, `tenantId`, and membership metadata in `localStorage`. Requests include the JWT via `Authorization` and send the active tenant through `X-Tenant-ID` plus the `tenantId` query param.
- API middleware (`tenantContext`, `authenticate`) resolves the tenant from the request, verifies the JWT, and checks membership/role requirements before handling tenant-scoped routes like `/users` and `/tenants`.

## Change Log
- Introduced tenant-level configuration support: new `TenantSettings` mongoose model (`packages/common/src/models/TenantSettings.js`), service helper (`apps/api/src/services/tenantSettingsService.js`), and secured Fastify routes (`GET/PUT /api/tenant-settings`) wired through the server; settings cover SMTP, webhook, branding, limits, feature flags, and arbitrary metadata while masking passwords/secrets and merging defaults.
- Added an admin "Tenant Ayarları" page (`apps/admin/src/pages/tenants/TenantSettings.jsx`) plus API client helpers so owners/admins can edit tenant settings with grouped sections, secret reset toggles, limit controls, feature flag management, and JSON metadata editing.
- Normalised tenant settings form styling to match the media library inputs by centralising Tailwind classes, ensuring consistent padding/borders across text, number, select, and textarea controls.
- Wired the `contentScheduling` feature flag into the content flow: API create/update routes now consult tenant settings before allowing `scheduled` status, returning 403 when disabled, and the admin content editor hides/disables scheduling UI accordingly.
- “Belgeler” sayfası (apps/admin/src/pages/docs/Documentation.jsx) ön tanımlı özellik bayraklarını statik olarak listeliyor; tenant’lar bayrakları Tenant Ayarları ekranından açıp kapatıyor. (Backend’deki flag uçları ilerideki ihtiyaclar için korunuyor.)
- Tenant bazlı galeriler: `Gallery` modeli ve `/api/galleries` CRUD uçları ile medya grupları yönetiliyor, admin panelinde “Galeriler” sayfasından medya seçimleri yapılarak galeriler oluşturulabiliyor. İçerik editörü bağlı galerileri listeleyip güncelleyebiliyor ve içerik API’si bağlı galerileri döndürüyor.
- Adjusted `apps/api/src/middleware/auth.js:47` so user lookup during auth only requires the `_id`; this keeps multi-tenant members authenticated when they switch tenants with a freshly issued membership token.
- Updated root `.env` with `R2_PUBLIC_DOMAIN`, upload limit, and default image variants to prepare Cloudflare R2 as the public media CDN (now exposes tenant files under `https://contextstore.ikon-x.com.tr/{slug}/...`).
- Expanded media schema (`packages/common/src/models/Media.js`) with tenant slug snapshots, file naming metadata, variant details, and status fields; introduced R2-backed media service plus `/api/media` routes supporting presigned uploads, automatic variant generation (including WebP thumbnails), and listing with filters.
- Added admin-side media API client and a Media Library page featuring drag & drop uploads, presigned PUT flow, filtering, and listing; linked it into routing/navigation so tenants can manage assets from the UI.
- Tenant picker now fetches memberships with fresh tenant-scoped JWTs so switching assets keeps the correct token in localStorage (`apps/admin/src/pages/tenants/Tenants.jsx`).
- Normalised R2 endpoint handling and forced path-style S3 requests so presigned URLs use `https://<account>.r2.cloudflarestorage.com/<bucket>/...` regardless of env formatting (`apps/api/src/services/mediaService.js`).
- Media API now supports metadata editing, per-item deletion, and bulk tag/delete operations; the admin media page gained a modal inspector with edit form, multi-select tooling, and tag assignment workflows.
- Updated Media UI actions to copy the public CDN URL directly from cards or the detail modal, replacing the old open-in-new-tab link.
- Media list header now surfaces the total asset count beside the title in a muted style, with a loading fallback to avoid visual flicker while queries resolve.
- Media search tolerates decomposed Turkish characters by allowing optional combining marks in regex matching, so queries like “afiş” now match tags regardless of Unicode normalization.
- Introduced hierarchical tenant categories with slug enforcement, default ordering attributes, and REST CRUD endpoints; admin console now has a “Kategoriler” section for tree management.
- Added versioned content data model (`packages/common/src/models/Content*.js`) plus matching Fastify service/routes (`apps/api/src/services/contentService.js`, `apps/api/src/routes/contents.js`) for CRUD, slug uniqueness, scheduling, and snapshot history.
- Added initial content management UI: content API client (`apps/admin/src/lib/api/contents.js`), content list page (`/contents`), and basic Lexical-powered editor (`/contents/:id` with `new` alias) featuring autosave, status & scheduling controls, version sidebar (read-only), and slug generation. Navigation updated to include “İçerikler”. Lexical dependencies added to admin `package.json`.
- Enhanced content editor (frontend):
  - Added category multi-select (inline list, persisted to `categories` field in save payloads).
  - Implemented slug uniqueness error feedback (captures backend error and shows inline message).
  - Introduced first iteration toolbar (bold, italic, underline, strikethrough, alignment) + list & code highlight plugins (packages added: `@lexical/list`, `@lexical/code`, `@lexical/rich-text`).
  - Added additional Lexical dependencies to `apps/admin/package.json` for richer formatting.
  - Saved categories now included in create/update payload; version snapshots thereby capture classification state.
- Updated admin API utilities to use the shared `apiClient` so requests hit `/api/*` (fixing 404s during dev) and aligned UI routes to English slugs (`/contents`, `/categories`) while keeping Turkish labels.
- Restyled the content editor with card-based layout, improved form inputs, and a playground-inspired Lexical toolbar (block dropdown, list toggles, undo/redo, alignment) while registering required nodes to avoid list/code plugin runtime errors.
- Fixed Lexical image plugin component export/import issues causing "Element type is invalid" errors; corrected `setIsMediaPickerOpen` undefined reference to use `closeMediaPicker()` function in `ContentEditor.jsx:602`.
- Resolved RichTextPlugin Portal component error by adding `LexicalErrorBoundary` default import from `@lexical/react/LexicalErrorBoundary` and passing it as `ErrorBoundary` prop to `RichTextPlugin`, also removed `editorState` from initial config to let `EditorStateHydrator` handle state management.
- Enhanced ImageComponent with advanced features: selection handling via `useLexicalNodeSelection`, resize functionality with drag handles, delete capability with DEL/Backspace keys, visual selection indicators with blue outline/dashed border, and contextual toolbar with delete button. Added corresponding CSS classes for focused/selected/draggable states in `ContentEditor.css`.
- Fixed editor state synchronization issues causing typing problems and Safari errors by properly wrapping node operations in `editor.update()` calls and using `$getNodeByKey()` instead of `editor.getElementByKey()`, removed problematic async state listeners that interfered with normal editor operations.
- Resolved React flushSync warning in EditorStateHydrator by moving editor state updates to microtask queue using `Promise.resolve().then()` to avoid React rendering conflicts during lifecycle methods.
- Updated editor theme and styling to match Lexical Playground design: replaced Tailwind classes with semantic CSS classes (editor-paragraph, editor-heading-h1, editor-ul, editor-ol, etc.), improved list styling with proper indentation and numbering (decimal, upper-alpha, lower-alpha progression), modernized toolbar with sticky positioning, compact buttons, and playground-style appearance.
- Implemented Lexical Playground-style formatting dropdown with icon-based toolbar: restored SVG icons for all toolbar buttons, created FormattingDropdown component with text transformation functions (lowercase, uppercase, capitalize), text formatting options (strikethrough, subscript, superscript), highlight functionality, and clear formatting with keyboard shortcuts (⌃+Shift+1-3, ⌘+Shift+X, ⌘+,, ⌘+., ⌘+\). Added corresponding CSS classes and positioning logic for dropdown menu.
- Fixed toolbar button display issues: removed all text content from toolbar buttons to show only SVG icons, converted remaining asset-based icons to embedded SVG (alignment icons, font size icons), fixed duplicate icon/text rendering issues causing mixed button appearances. All toolbar buttons now display clean icon-only interface matching Lexical Playground exactly.
- Implemented asset icon prioritization system: updated ContentEditor.css to prioritize existing ./assets/icons/ files over embedded SVG icons. Replaced embedded SVG with asset references for undo/redo (arrow-counterclockwise.svg, arrow-clockwise.svg), lists (list-ul.svg, list-ol.svg), text formatting (type-bold.svg, type-italic.svg, type-underline.svg, type-strikethrough.svg), code (code.svg), links (link.svg), text alignment (text-left.svg, text-center.svg, text-right.svg), and dropdown formatting options (type-lowercase.svg, type-uppercase.svg, type-subscript.svg, type-superscript.svg, highlighter.svg). Keeps embedded SVG only for icons not available in assets directory.
- Fixed formatting dropdown positioning issue: changed from `position: absolute` to `position: fixed` in ContentEditor.css to ensure dropdown opens directly below the toolbar button regardless of page scroll position.
- **Form System - Phase 1 Complete (Data Models & Service Layer)**:
  - Updated `FormDefinition` model with comprehensive field types (13 types), conditional logic, i18n support, versioning, settings schema, and proper indexes
  - Created `FormVersion` model for immutable version snapshots with change tracking and diff support
  - Enhanced `FormResponse` model with file attachments, geo-location, device info, spam detection, and webhook delivery tracking
  - Built `formService.js` with 14 operations: create, update, publish, archive, getById, getBySlug, list, deleteForm, hardDelete, getVersionHistory, restoreVersion, duplicate, generateUniqueSlug, ensureUniqueSlug
  - Created `formValidation.js` with Zod schemas for form creation, updates, submissions, and dynamic validation schema building from form fields
  - Implemented 12 admin API routes in `apps/api/src/routes/forms.js`: list, create, get, update, publish, archive, delete, versions, restore, duplicate, check-slug
  - Registered form routes in server.js with proper middleware integration
  - Installed dependencies: uuid (v4 for field IDs), zod (schema validation)
- **Form System - Phase 2 Started (Frontend Form List)**:
  - Created `apps/admin/src/lib/api/forms.js` API client with 11 functions (listForms, getForm, createForm, updateForm, publishForm, archiveForm, deleteForm, getFormVersions, restoreFormVersion, duplicateForm, checkFormSlug)
  - Built `apps/admin/src/pages/forms/FormList.jsx` (430+ lines):
    - Grid view with card-based layout
    - Status filtering (draft, published, archived) and text search
    - Status badges with icons (draft=ClockIcon, published=CheckCircleIcon, archived=ArchiveBoxIcon)
    - Form statistics display (field count, submission count)
    - Action buttons (Edit, View Responses, Delete with confirmation)
    - Pagination support
    - Empty states and loading states
    - Delete confirmation flow
  - Added forms navigation to Layout.jsx menu (Formlar with ClipboardDocumentListIcon)
  - Registered /forms route in App.jsx pointing to FormList component
- Fixed user registration endpoint: corrected SignUp form (`apps/admin/src/pages/auth/SignUp.jsx`) to send `tenantName` and `tenantSlug` instead of `organizationName`/`subdomain`, matching backend API expectations. Resolved mailService import issue (`apps/api/src/services/mailService.js`) by using singleton tenantSettingsService instead of attempting constructor instantiation. Registration now works properly with `/api/auth/register` endpoint creating new users and tenants.
- Updated formatting dropdown button to match Lexical Playground style: changed from simple "Aa" text button to playground-style button with `dropdown-more` icon and `chevron-down` icon, updated className from `editor-toolbar__button formatting-trigger` to `toolbar-item spaced`, added corresponding CSS classes with proper styling. Fixed CSS vendorPrefix warning by adding standard `appearance` property alongside `-moz-appearance`.
- Changed default font size from 16px to 12px: updated `DEFAULT_FONT_SIZE` constant in ContentEditor.jsx to provide more compact text formatting by default.
- Converted text and highlight color pickers to icon-only format: updated ColorPicker component to use font-color.svg and bg-color.svg icons from assets, removed text labels and created new CSS classes (.editor-toolbar__color-picker-icon, .color-icon, .editor-toolbar__color-input-hidden) for icon-based color selection that matches toolbar button styling. Color input is now hidden and triggered by clicking the icon.
- Implemented image alignment functionality: added `__alignment` field to ImageNode with left/center/right options (default: center), updated constructor, clone, import/export methods, and added `setAlignment()` and `getAlignment()` methods. Enhanced ImageComponent with alignment prop, dynamic container styling using Tailwind flex classes (`justify-start`, `justify-center`, `justify-end`), and alignment control buttons in the selection toolbar. When image is selected, users can click left/center/right alignment buttons to change image positioning.
- Added image caption functionality: implemented `__caption` and `__showCaption` fields in ImageNode with default caption being altText, added setCaption(), getCaption(), setShowCaption(), getShowCaption() methods, updated constructor/clone/import/export. Enhanced ImageComponent with caption display directly below image within the alignment container (when enabled), caption visibility toggle button, edit button, and modal dialog for caption editing. Users can toggle caption visibility and edit caption text through selection toolbar. Caption appears as centered italic text below the image and follows the same alignment as the image (left/center/right).
- Implemented comprehensive table system with Google Docs-style functionality: created TableNode, TableRowNode, and TableCellNode with full Lexical integration, built TableDimensionSelector component with 10x10 grid for visual table creation, added table toolbar button with dropdown selector and embedded SVG table icon. Implemented column resizing with mouse drag functionality directly in TableCellNode.createDOM() with visual feedback and real-time width updates. Tables support rich content in cells (text, images, formatting) since TableCellNode is an ElementNode. Added TableContextMenu component for row operations (insert above/below, delete row, delete table) with proper CSS styling. Enhanced table borders with darker color (#374151) for better cell visibility, added white backgrounds and empty cell content placeholders. All table functionality integrated into ContentEditor with proper state management and Lexical node registration.
- Compacted the deletion history panel in the content editor by capping the visible "Silme geçmişi" list to a scrollable container that shows at most two deleted version cards at a time, keeping the sidebar layout tidy even with long logs.
- Relocated content status and publish date controls to a new "Yayınlama" sidebar card; switching to "Yayında" now pre-fills the publish timestamp with the current moment while keeping the field editable for manual adjustments.
- Moved the content save controls into a sticky card anchored at the top of the right sidebar so status tips sit above the save button while it stays visible as you scroll.

## Maintenance Notes
- Update this file after every code or config change handled by Codex so we keep a running history and high-level context for the project.

## Media Roadmap
- Backend
  - [x] Create an S3 client wrapper (via `@aws-sdk/client-s3`) that reads R2 credentials, bucket, and image variant sizes from environment variables and resolves public URLs using `R2_PUBLIC_DOMAIN` and tenant slug.
  - [x] Introduce `/media` routes (list, presign/upload registration) guarded by tenant auth; enforce a 100 MB payload limit and generate variants with Sharp (`thumbnail`, `medium`, `large` in WebP) alongside the original.
  - [x] Persist file metadata to `Media` model (size, mime, variants, tags, alt text, uploader) and allow filtering by tag, type, and text search.
- Admin UI
  - [x] Build a “Media / Ortam” section with a grid/list view, client-side filters (type, tags, text), and basic drag & drop uploads.
  - [x] Add forms to edit alt text, caption, tags, and other metadata inline (modal inspector with per-item delete).
  - [ ] Enhance upload flow with richer progress tracking and error surfacing (e.g., per-file state, variant previews).
- Categories
  - [x] Implement hierarchical category CRUD with default sort attributes.
  - [ ] Surface per-category overrides for additional settings (e.g., featured flags, filter presets).
  - [ ] Provide drag-and-drop reordering for sibling categories in the admin UI.
- Integration
  - [ ] Expose a reusable picker component so other forms (e.g., content editors) can select existing assets, and propagate selected file metadata (URL, alt, variants) through the app.

## Content & Versioning

### Overview
Implements a tenant‑scoped, versioned content system with immutable historical snapshots. Each `Content` document represents the current mutable state; every create/update produces a `ContentVersion` snapshot (append-only) capturing the full editorial state at that moment (title, slug, summary, lexical JSON, rendered HTML, classification, media linkage, scheduling + status, author attribution).

### Models (packages/common)
- `Content`:
  - Core fields: `title`, `slug` (unique per tenant), `summary`, `lexical` (raw Lexical editor JSON), `html` (rendered HTML for indexing / public rendering), `categories[]`, `tags[]`, `featuredMediaId`, `authorName`.
  - Workflow fields: `status` (`draft|scheduled|published|archived`), `publishAt` (planned date-time for scheduled publish), `publishedAt` (actual publish timestamp), `publishedBy`.
  - Version tracking: `version` (current integer), `lastVersionId` (ObjectId of most recent `ContentVersion`).
  - Audit: `createdBy`, `updatedBy`, timestamps.
  - Indexes: unique `{ tenantId, slug }`; query helpers over status, categories, tags.
- `ContentVersion`:
  - Immutable snapshot: mirrors all user-facing & workflow fields of `Content` at change time plus `version`.
  - Index: `{ tenantId, contentId, version: -1 }` for fast latest retrieval & chronological diffing.
  - Stores `lexical`+`html` to guarantee reproducible historical render even if future transforms change.

### Service Logic (`contentService.js`)
- `slugify(value)`: Normalises titles/slugs (lowercase, dash-separated, strips non-alphanumerics).
- `ensureUniqueSlug({ tenantId, slug, excludeId })`: Enforces per-tenant uniqueness pre-write (throws on conflict).
- `resolveStatusAndDates({ status, publishAt })`:
  - `published`: sets `publishAt` & `publishedAt` to provided date or now.
  - `scheduled`: requires `publishAt` future timestamp; clears `publishedAt`.
  - `archived`: clears scheduled/published timestamps.
  - default: `draft` with null scheduling fields.
- Create:
  - Generates slug (fallback to title), validates uniqueness, resolves workflow fields, sets `version=1`.
  - Persists `Content`, then creates `ContentVersion (version=1)`, updates `lastVersionId`.
- Update:
  - Field-by-field conditional mutation; re-slugifies if slug/title changed and re-validates uniqueness.
  - Recomputes workflow fields (status + date handling) each update.
  - Increments `version`, writes snapshot to `ContentVersion`, updates `lastVersionId`.
- Delete:
  - Removes both `Content` and its `ContentVersion` snapshots (full purge).
- List / Get:
  - Filtering: status, single category, single tag, text search over `title|summary` (case-insensitive regex token normalized by whitespace).
  - Pagination: page/limit (1–100) returns `items` + `pagination` metadata.
- Versions:
  - Lists all snapshots descending by version. (No restore endpoint yet.)

### Current Routes (`apps/api/src/routes/contents.js`)
- `GET   /api/contents` — list with filters & pagination.
- `POST  /api/contents` — create (requires editor role).
- `GET   /api/contents/:id` — fetch single content (+ populated `featuredMediaId`).
- `PUT   /api/contents/:id` — update & create new version.
- `DELETE /api/contents/:id` — hard delete + purge versions.
- `GET   /api/contents/:id/versions` — list historical versions.

### Editorial Workflow States
- `draft`: Work in progress; not scheduled/published.
- `scheduled`: Awaiting a future `publishAt`. (Currently no background promotion job implemented.)
- `published`: Live; `publishedAt` recorded (set on transition to published).
- `archived`: Retired; timestamps cleared; remains queryable but not surfaced by default in future public endpoints.

### Gaps / Planned Enhancements
1. Version Operations
  - [ ] `POST /api/contents/:id/restore/:version` — copy snapshot fields back into main `Content`, increment version, new snapshot.
  - [ ] Lightweight diff endpoint (`GET /api/contents/:id/diff?from=..&to=..`) for title/summary/status + lexical structural diff (JSON patch style).
2. Scheduling
  - [ ] Background scheduler / cron to promote `scheduled` items whose `publishAt <= now` to `published`, setting `publishedAt` & `publishedBy` (system user or null) and creating a new snapshot.
3. Validation / Rules
  - [ ] Prevent status regression (e.g., published -> draft) unless user has elevated role; instead require explicit copy or new version with audit reason.
  - [ ] Enforce `publishAt` must be future for `scheduled` and unset for `draft`.
4. Slug Management
  - [ ] Slug suggestion API (`GET /api/contents/slug?suggest=Title Here`) returning unique candidate if base occupied (e.g., `title-here-2`).
  - [ ] Slug history tracking to support redirects (new `ContentSlug` collection referencing old -> current).
5. Indexing / Search
  - [ ] Add text index on (`title`, `summary`, `html`) per tenant; fallback to regex only for dev/local.
  - [ ] Denormalised keywords field (auto-extracted from lexical) for faster tag-like filtering.
6. Media Integration
  - [ ] Media picker component reused across forms (ties to Media Roadmap Integration task).
  - [ ] On snapshot creation, optionally persist derived image dimension metadata for featured media to avoid extra populate roundtrip on public render.
7. Categories & Tags
  - [ ] Multi-select UI with async search & creation (tags) in editor frontend.
  - [ ] Category tree selector with keyboard filtering & parent path display.
8. Lexical Editor Frontend
  - [ ] Rich toolbar: headings (h1–h3), bold/italic/underline/strikethrough, lists (bullet/ordered), blockquote, code block, horizontal rule, links, alignment.
  - [ ] Custom nodes: image (from media picker), embed (YouTube/Twitter), callout/info box, divider, table (phase 2), inline code.
  - [ ] Dual persistence: store exact Lexical JSON (`lexical`) + pre-rendered HTML (`html`). HTML produced client-side initially, later via trusted server transform for sanitization.
  - [ ] Auto-save draft debounced (e.g., 1–2s idle) that triggers `PUT /contents/:id` only when JSON changed & form valid.
  - [ ] Version sidebar: list recent versions with timestamp, status, diff preview, restore action (calls future restore endpoint).
9. Public Delivery (Future)
  - [ ] Read-only public endpoint(s) with caching: `/public/contents` filtering by status=published + publishAt<=now.
  - [ ] Stale-while-revalidate cache strategy (Redis / memory) keyed by tenant + slug.
10. Security / Sanitization
  - [ ] Server-side sanitize HTML (DOMPurify w/ JSDOM or sanitize-html) before persistence to mitigate XSS from custom nodes.
  - [ ] Enforce size limits on lexical JSON (prevent runaway large documents).
11. Analytics / Audit
  - [ ] Append reason field when changing status (archived/unpublish) stored in version snapshot.
  - [ ] Track editorial metrics (time from draft -> published, number of revisions per content).

### Frontend Editor Data Flow (Planned)
1. Load existing content: fetch `GET /api/contents/:id` -> seed Lexical editor with `lexical` (fallback to empty root).
2. User edits: local Lexical state updates rapidly; a debounced effect serializes JSON & derived HTML.
3. Auto-save: if dirty & no pending request, send minimal payload fields changed (title, summary, lexical, html, status transitions, classification updates).
4. On successful response: update local version number & push optimistic entry into version sidebar.
5. Manual publish: change status to `published` or set `scheduled + publishAt`; service creates new snapshot capturing that state.

### Open Questions / Decisions Needed
- Should restore create a brand new version (recommended) or overwrite state without version increment (not recommended)? → Plan: always create new version.
- Tag model: currently tags are ObjectId references (list) vs. freeform strings? (Present code normalises to ObjectIds—introduce `Tag` model or keep lightweight referencing?).
- Rich text sanitization location: client vs. server vs. both? Plan: server authoritative sanitize on write.
- Multi-tenant cross-content search: will we need aggregated global search? If yes, consider external index (Meilisearch/Elastic) adapter layer later.

### Immediate Next Steps (Implementation Order)
1. Build admin Lexical editor skeleton (JSON state, toolbar stub, save button invoking existing update endpoint).
2. Introduce media picker modal & embed node basic support.
3. Add restore endpoint & version sidebar UI integration.
4. Implement scheduling promotion cron (simple setInterval worker inside API for now, later external worker).
5. Add HTML sanitization step in service layer before persistence.
6. Slug suggestion endpoint & collision-handling UI.

---

## Forms System Architecture

### Overview
Comprehensive form builder, submission, and analytics system with drag-and-drop UI, conditional logic, versioning, multi-tenant isolation, and embeddable components. Integrates with existing content, media, and notification infrastructure.

### Core Concepts

#### 1. Form Structure
- **Form Document**: Schema definition with versioning, publication status (draft/published), visibility (public/authenticated), anti-spam settings
- **Fields**: Typed inputs with labels, validation rules (required, min/max, pattern), conditional visibility logic, i18n label support
- **Response**: User submissions with metadata (createdAt, source app, device/IP, geo-location, file references)
- **Versioning**: Immutable history—each form edit increments version; responses track which form version they were submitted against
- **Tenant Isolation**: All collections enforce `tenantId` scoping; forms, responses, and settings are tenant-specific

#### 2. Security & Validation
- **Authentication**: 
  - Admin endpoints: JWT + `X-Tenant-ID` header (existing auth middleware)
  - Public submission: Tenant slug + form slug identification (no auth required)
- **Validation**: Server-side schema validation using Zod
  - Enforce field rules: required, min/max length/value, regex patterns
  - Type validation: email, phone, URL, number ranges, date constraints
- **Anti-Abuse Measures**:
  - Rate limiting: IP + form-based throttling (realistic limits: 5 submissions per minute, not 60/sec)
  - Optional CAPTCHA integration (keys stored in TenantSettings)
  - Honeypot fields: hidden input with `shouldBeEmpty` validation
  - IP logging and geo-location tracking for abuse analysis

#### 3. Field Types
Core field palette for form builder:
- **Text**: Single-line text input (with email/phone/url validation variants)
- **Number**: Integer or decimal with min/max constraints
- **Select**: Dropdown with predefined options
- **Radio**: Single choice from visible options
- **Checkbox**: Multiple choice selections
- **Date**: Date/time picker with range constraints
- **File**: Upload with size/type validation (R2 integration)
- **Rating**: Star/numeric rating scale
- **Hidden**: Form metadata (tracking codes, referrer info)
- **Textarea**: Multi-line text input
- **Section**: Visual grouping/heading (non-input)

### Data Models (packages/common/src/models/)

#### Form Model
```javascript
{
  tenantId: ObjectId (required, indexed),
  title: String (required, i18n map),
  slug: String (required, unique per tenant, indexed),
  description: String (i18n map),
  
  // Form structure
  fields: [{
    id: String (UUID),
    type: Enum (text, number, select, radio, checkbox, date, file, email, phone, rating, hidden, textarea),
    label: Object (i18n map: { en, tr, ... }),
    placeholder: Object (i18n map),
    required: Boolean,
    validation: {
      min: Number,
      max: Number,
      pattern: String (regex),
      fileTypes: [String],
      maxFileSize: Number (MB)
    },
    options: [{
      value: String,
      label: Object (i18n map)
    }],
    conditionalLogic: {
      field: String (field id),
      operator: Enum (equals, notEquals, contains, greaterThan, lessThan),
      value: Mixed
    },
    defaultValue: Mixed
  }],
  
  // Publication & visibility
  status: Enum (draft, published, archived),
  visibility: Enum (public, authenticated),
  version: Number (starts at 1),
  lastVersionId: ObjectId,
  
  // Settings
  settings: {
    submitButtonText: Object (i18n map),
    successMessage: Object (i18n map),
    redirectUrl: String,
    enableCaptcha: Boolean,
    enableHoneypot: Boolean,
    allowMultipleSubmissions: Boolean,
    submitLimit: Number,
    enableNotifications: Boolean,
    notificationEmails: [String],
    webhookUrl: String
  },
  
  // Analytics metadata
  submissionCount: Number (default: 0),
  lastSubmissionAt: Date,
  
  // Audit
  createdBy: ObjectId,
  updatedBy: ObjectId,
  publishedBy: ObjectId,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `{ tenantId: 1, slug: 1 }` unique
- `{ tenantId: 1, status: 1, createdAt: -1 }`

#### FormVersion Model
```javascript
{
  tenantId: ObjectId (required),
  formId: ObjectId (required, ref: Form),
  version: Number (required),
  
  // Snapshot of form state
  title: Object (i18n map),
  description: Object (i18n map),
  fields: Array (full field definitions),
  settings: Object (full settings),
  status: String,
  
  // Metadata
  createdBy: ObjectId,
  createdAt: Date,
  changeNote: String (optional)
}
```

**Indexes**:
- `{ tenantId: 1, formId: 1, version: -1 }`

#### FormResponse Model
```javascript
{
  tenantId: ObjectId (required, indexed),
  formId: ObjectId (required, ref: Form, indexed),
  formVersion: Number (required),
  
  // Response data
  data: Object (key-value pairs, field id -> response value),
  files: [{
    fieldId: String,
    mediaId: ObjectId (ref: Media),
    filename: String,
    size: Number,
    mimeType: String
  }],
  
  // Submission metadata
  source: String (web, mobile, api),
  locale: String,
  userAgent: String,
  ip: String (hashed for privacy),
  geo: {
    country: String,
    city: String,
    coordinates: [Number] (optional)
  },
  referrer: String,
  
  // User identification (if authenticated)
  userId: ObjectId (optional),
  userEmail: String (optional),
  
  // Status & processing
  status: Enum (pending, processed, spam),
  flaggedAsSpam: Boolean (default: false),
  spamScore: Number,
  
  // Audit
  createdAt: Date,
  processedAt: Date
}
```

**Indexes**:
- `{ tenantId: 1, formId: 1, createdAt: -1 }`
- `{ tenantId: 1, status: 1 }`
- `{ ip: 1, createdAt: -1 }` (for rate limiting)

### API Endpoints (apps/api/src/routes/forms.js)

#### Admin Endpoints (JWT + Tenant Auth)
- `GET    /api/forms` — List forms with filters (status, search)
- `POST   /api/forms` — Create new form (draft, version=1)
- `GET    /api/forms/:id` — Get form details with field definitions
- `PUT    /api/forms/:id` — Update form (increments version if published)
- `DELETE /api/forms/:id` — Soft delete (set status=archived)
- `POST   /api/forms/:id/publish` — Publish form (status=published, version++, create snapshot)
- `GET    /api/forms/:id/versions` — List version history
- `POST   /api/forms/:id/restore/:version` — Restore from version snapshot
- `GET    /api/forms/:id/responses` — List submissions with filters (date range, status)
- `GET    /api/forms/:id/analytics` — Aggregated statistics
- `POST   /api/forms/:id/responses/export` — Export responses (CSV/XLSX/JSON)
- `DELETE /api/forms/:id/responses/:responseId` — Delete individual response
- `POST   /api/forms/:id/responses/bulk` — Bulk operations (delete, mark spam)

#### Public Endpoints (No Auth)
- `GET    /api/public/forms/:tenantSlug/:formSlug` — Get published form schema
- `POST   /api/public/forms/:tenantSlug/:formSlug/submit` — Submit response
  - Rate limiting: 5 requests per minute per IP + form
  - CAPTCHA validation (if enabled)
  - Honeypot check (if enabled)
  - File upload handling (presigned R2 URLs)
  - Returns: success message or validation errors

### Service Layer (apps/api/src/services/formService.js)

#### Core Operations
- `create({ tenantId, data, userId })`: Create form with version=1, generate slug
- `update({ tenantId, formId, data, userId })`: Update form, increment version if published
- `publish({ tenantId, formId, userId })`: Change status to published, create snapshot
- `getById({ tenantId, formId, populateFields })`: Fetch with optional field population
- `list({ tenantId, filters, pagination })`: List with search, status filtering
- `delete({ tenantId, formId })`: Soft delete (status=archived)

#### Version Management
- `createVersion({ tenantId, formId, changeNote, userId })`: Create immutable snapshot
- `getVersions({ tenantId, formId, pagination })`: List version history
- `restoreVersion({ tenantId, formId, version, userId })`: Copy snapshot back, increment version

#### Response Handling
- `submitResponse({ tenantSlug, formSlug, data, metadata })`: Public submission
  - Validate against form schema (Zod)
  - Check rate limits (Redis cache)
  - Verify CAPTCHA (if enabled)
  - Process file uploads (R2 integration)
  - Send notifications (email + webhook)
  - Return success/error response
- `getResponses({ tenantId, formId, filters, pagination })`: List with date/status filtering
- `exportResponses({ tenantId, formId, format })`: Stream CSV/XLSX/JSON
- `deleteResponse({ tenantId, responseId })`: Hard delete single response
- `bulkOperations({ tenantId, responseIds, operation })`: Bulk delete or spam marking

#### Validation & Security
- `validateSchema(formFields)`: Build Zod schema from field definitions
- `checkRateLimit({ ip, formId })`: Enforce submission rate limits (Redis)
- `verifyCaptcha({ token, secret })`: Validate CAPTCHA response
- `checkHoneypot({ fieldValue })`: Verify honeypot field is empty
- `calculateSpamScore(response)`: Heuristic spam detection
- `sanitizeInput(data)`: Clean user input before persistence

#### Analytics
- `getAnalytics({ tenantId, formId, dateRange })`: Aggregated stats
  - Total submissions (by day/week/month)
  - Completion rate (started vs. submitted)
  - Field-level statistics (most/least selected options)
  - Response time distribution
  - Geographic distribution
  - Source/device breakdown

### Frontend Components

#### A. Form Builder (apps/admin/src/pages/forms/)

**Main Pages**:
- `FormList.jsx`: Grid/list view with create button, search, filters
- `FormBuilder.jsx`: Drag-and-drop form editor with live preview
- `FormResponses.jsx`: Response table with filters, export, analytics
- `FormAnalytics.jsx`: Charts and statistics dashboard

**Builder Features**:
- **Field Palette**: Draggable field types with icons
- **Canvas**: Drop zone with field reordering
- **Field Inspector Panel**:
  - Label editor (multi-language support)
  - Validation rules (required, min/max, pattern)
  - Conditional logic builder (show/hide based on other fields)
  - Default values and placeholders
  - Help text and tooltips
- **Form Settings Panel**:
  - Submit button text (i18n)
  - Success message and redirect URL
  - Anti-spam options (CAPTCHA, honeypot, rate limits)
  - Notification settings (email addresses, webhook URL)
  - Submission limits
- **Preview Mode**: Live form preview with test submissions
- **Version Control**: 
  - Version history sidebar
  - Diff view between versions
  - Restore from version
  - Publish workflow (draft → review → published)

**UI Libraries**:
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop
- `react-hook-form` for form state management
- `zod` for client-side validation
- `recharts` for analytics visualizations

#### B. Form Renderer (packages/forms/)

**Package Structure**:
```
packages/forms/
  src/
    components/
      FormEmbed.jsx          # Main React component
      fields/                # Individual field components
        TextField.jsx
        SelectField.jsx
        FileField.jsx
        ...
      ConditionalWrapper.jsx # Handles conditional logic
      FormProgress.jsx       # Multi-page progress indicator
    embed/
      vanilla.js            # Standalone JS for script embed
      styles.css            # Default styling
    utils/
      validation.js         # Client-side validation
      i18n.js               # Localization helpers
      api.js                # Form submission API
  public/
    forms.js                # Bundled embed script
  package.json
  vite.config.js           # Build configuration
```

**React Component API**:
```jsx
<FormEmbed
  formSlug="contact-form"
  tenantSlug="acme"
  locale="tr"
  theme={{
    primary: '#3b82f6',
    background: '#ffffff',
    text: '#1f2937',
    error: '#ef4444'
  }}
  onSuccess={(response) => {
    console.log('Form submitted:', response);
  }}
  onError={(error) => {
    console.error('Submission error:', error);
  }}
  captchaSiteKey="6Lc..." // Optional CAPTCHA key
/>
```

**Vanilla JS Embed**:
```html
<div id="contexthub-form" data-tenant="acme" data-form="contact-form"></div>
<script src="https://contextstore.ikon-x.com.tr/forms.js"></script>
<script>
  ContextHub.Forms.render({
    container: '#contexthub-form',
    tenant: 'acme',
    form: 'contact-form',
    locale: 'tr',
    onSuccess: function(response) {
      alert('Thank you for your submission!');
    }
  });
</script>
```

**Features**:
- Conditional field rendering (show/hide based on logic)
- Multi-page forms with progress indicator
- File upload with progress bar (R2 presigned URLs)
- CAPTCHA integration (Google reCAPTCHA / hCaptcha)
- Real-time client-side validation
- Accessible (ARIA labels, keyboard navigation)
- Responsive design (mobile-first)
- Loading states and error handling
- i18n support (dynamic label translation)

#### C. Form Analytics (apps/admin/src/pages/forms/)

**Analytics Dashboard Components**:
- **Summary Cards**:
  - Total submissions (with trend indicator)
  - Completion rate percentage
  - Average completion time
  - Last submission timestamp
- **Time-Series Chart**: Submissions over time (day/week/month view)
- **Field Statistics**:
  - Text fields: word cloud of common terms
  - Select/Radio/Checkbox: Distribution charts
  - Rating fields: Average rating with histogram
  - File fields: Total uploads and file types
- **Geographic Map**: Submission locations (if geo enabled)
- **Source Breakdown**: Pie chart (web, mobile, API)
- **Response Table**: Paginated list with search and filters
- **Export Controls**: Download CSV, XLSX, or JSON

**Export Formats**:
- **CSV**: Flattened data with one row per submission
- **XLSX**: Formatted Excel with multiple sheets (responses, summary)
- **JSON**: Raw data with full metadata

### Integrations

#### 1. Content Integration
- Content editor toolbar button: "Insert Form"
- Form picker modal with search and preview
- Embed shortcode: `[form slug="contact-form"]`
- Renderer parses shortcode and replaces with FormEmbed component
- Form list shows usage count (which content pieces embed this form)

#### 2. Media Integration
- File field type uses existing R2 presigned upload flow
- Form submission references mediaId in response
- Response viewer displays file thumbnails and download links
- File uploads count towards tenant storage limits

#### 3. Email Notifications
- Uses existing TenantSettings SMTP configuration
- Notification templates stored in form settings
- Rate-limited notifications (max 1 per minute per form)
- Email content includes:
  - Form title and submission timestamp
  - All field values (formatted for readability)
  - Link to view full response in admin
  - Attached files (optional)

#### 4. Webhook Integration
- Webhook URL configured per form
- POST request sent on each submission
- Payload includes:
  - Form metadata (id, title, version)
  - Response data (all field values)
  - Submission metadata (IP, user agent, timestamp)
  - HMAC signature for verification
- Delivery queue (Redis/BullMQ):
  - Retry logic (exponential backoff)
  - Max 5 retry attempts
  - Delivery status tracking
- Admin UI shows webhook delivery logs

#### 5. RBAC Integration
- Uses existing role/membership system
- Permissions:
  - **Owner/Admin**: Full access (create, edit, delete, view responses)
  - **Editor**: Create and edit forms, view responses
  - **Analyst**: View-only access to forms and analytics
  - **Viewer**: Cannot access forms module
- Response data access controlled by tenant membership

### Implementation Roadmap

#### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Create data models (Form, FormVersion, FormResponse)
- [ ] Build form service layer with CRUD operations
- [ ] Implement API endpoints (admin + public)
- [ ] Add Zod validation schemas
- [ ] Set up rate limiting (Redis integration)

#### Phase 2: Form Builder UI (Week 3-4)
- [ ] Build drag-and-drop form builder
- [ ] Implement field palette and inspector
- [ ] Add conditional logic builder
- [ ] Create form settings panel
- [ ] Build version control UI
- [ ] Add preview mode

#### Phase 3: Form Renderer (Week 5)
- [ ] Create React FormEmbed component
- [ ] Build individual field components
- [ ] Implement conditional rendering
- [ ] Add file upload with progress
- [ ] Integrate CAPTCHA
- [ ] Build vanilla JS embed script

#### Phase 4: Responses & Analytics (Week 6)
- [ ] Build response list and detail views
- [ ] Create analytics dashboard
- [ ] Implement export functionality (CSV/XLSX/JSON)
- [ ] Add filtering and search
- [ ] Build webhook delivery system

#### Phase 5: Integrations (Week 7)
- [ ] Content editor form picker
- [ ] Email notification system
- [ ] Webhook configuration and testing
- [ ] RBAC permission enforcement
- [ ] Documentation and examples

### Configuration & Settings

#### TenantSettings Extensions
Add to existing TenantSettings model:
```javascript
forms: {
  enabled: Boolean (default: true),
  captchaEnabled: Boolean,
  captchaProvider: Enum (recaptcha, hcaptcha),
  captchaSiteKey: String,
  captchaSecretKey: String (encrypted),
  maxFormsPerTenant: Number (default: 50),
  maxResponsesPerForm: Number (default: 10000),
  defaultRateLimit: Number (default: 5 per minute),
  enableGeoLocation: Boolean (default: false),
  enableWebhooks: Boolean (default: true),
  webhookRetryAttempts: Number (default: 5)
}
```

#### Environment Variables (.env)
```env
# Form system
FORMS_RATE_LIMIT_WINDOW=60000  # 1 minute
FORMS_RATE_LIMIT_MAX=5         # 5 submissions per window
FORMS_MAX_FILE_SIZE=10         # MB per file
FORMS_MAX_FILES_PER_FORM=5     # Max file fields per form
FORMS_WEBHOOK_TIMEOUT=5000     # Webhook request timeout (ms)
FORMS_EXPORT_MAX_ROWS=50000    # Max rows for CSV/XLSX export

# CAPTCHA (optional)
RECAPTCHA_SECRET_KEY=...
HCAPTCHA_SECRET_KEY=...
```

### Security Considerations

1. **Input Sanitization**:
   - All text inputs sanitized with DOMPurify
   - File uploads validated by type and size
   - SQL injection prevention (parameterized queries)

2. **Rate Limiting**:
   - IP-based limits per form (prevent spam)
   - Global tenant limits (prevent abuse)
   - Admin endpoints rate-limited separately

3. **Data Privacy**:
   - IP addresses hashed before storage
   - PII flagging for GDPR compliance
   - Response data encrypted at rest
   - Configurable data retention policies

4. **Access Control**:
   - Tenant isolation enforced at DB query level
   - Response data never exposed cross-tenant
   - File uploads scoped to tenant R2 prefix

5. **Webhook Security**:
   - HMAC signature verification
   - HTTPS-only webhook URLs
   - Request timeout enforcement
   - Retry with exponential backoff

### Testing Strategy

1. **Unit Tests**:
   - Form validation schemas
   - Conditional logic evaluation
   - Spam detection algorithms
   - Export formatting functions

2. **Integration Tests**:
   - Form CRUD operations
   - Response submission flow
   - Webhook delivery and retry
   - File upload to R2

3. **E2E Tests**:
   - Complete form creation and publication
   - Public form submission
   - Analytics data aggregation
   - Export file generation

4. **Performance Tests**:
   - High-volume form submissions
   - Large dataset exports
   - Concurrent form builder users
   - Rate limiting effectiveness

### Open Questions & Decisions

1. **Multi-Page Forms**: Support multi-step forms with page breaks and navigation?
   - Decision: Phase 2 feature - add `pages` array to form schema

2. **Form Templates**: Pre-built form templates (contact, survey, registration)?
   - Decision: Include 5-10 common templates in initial release

3. **Response Editing**: Allow users to edit submitted responses?
   - Decision: Admin-only feature with audit trail

4. **Anonymous Submissions**: Track anonymous vs. authenticated responses differently?
   - Decision: Store userId when available, mark as anonymous otherwise

5. **Form Duplication**: Copy existing form as starting point?
   - Decision: Yes - "Duplicate" action creates new form with copied fields

6. **Field Dependencies**: Complex multi-field conditional logic (AND/OR)?
   - Decision: Start with simple single-field conditions, expand in Phase 2

7. **Calculation Fields**: Computed fields (e.g., sum, average)?
   - Decision: Phase 3 feature - add `calculation` field type

8. **Integration Marketplace**: Third-party integrations (Zapier, Slack, etc.)?
   - Decision: Phase 4 - build webhook-first, then specific integrations

### Documentation Tasks

- [ ] API reference (OpenAPI/Swagger)
- [ ] Form builder user guide
- [ ] Embed integration examples (React, Vue, WordPress, HTML)
- [ ] Webhook payload format and signature verification
- [ ] CAPTCHA setup instructions
- [ ] Analytics metrics definitions
- [ ] Export format specifications

---
Document last updated: 2025-10-05

## Form Builder (Phase 2) - Form Creation & Editing

### New Dependencies Added (Admin Panel)
- `@dnd-kit/core` (v6.x): Modern drag-and-drop toolkit for React - core library
- `@dnd-kit/sortable` (v8.x): Sortable presets and utilities for drag-and-drop lists
- `@dnd-kit/utilities` (v3.x): Helper utilities for drag-and-drop interactions
- `react-hook-form` (v7.x): Performant form validation and state management

### Completed Features

#### 1. Form Builder UI Implementation
**Location**: `apps/admin/src/pages/forms/FormBuilder.jsx` (630+ lines)
- Three-tab interface: Form Oluştur (Build), Ayarlar (Settings), Önizleme (Preview)
- Real-time language switcher (TR/EN) with flag buttons
- Unsaved changes detection with browser warning
- Auto-save functionality with React Query mutations
- Debug logging for field updates and save operations

**Components Created**:
1. **FieldPalette** (`apps/admin/src/components/forms/FieldPalette.jsx`)
   - 13 field types: text, email, phone, number, textarea, select, radio, checkbox, date, file, rating, hidden, section
   - Drag-to-add functionality with visual feedback
   - Grouped by category (Basic, Selection, Special)

2. **FormCanvas** (`apps/admin/src/components/forms/FormCanvas.jsx`)
   - Drag-and-drop field reordering with @dnd-kit/sortable
   - Field selection and deletion
   - Empty state with helpful message
   - Visual field type indicators with icons

3. **FieldInspector** (`apps/admin/src/components/forms/FieldInspector.jsx`, 471 lines)
   - Three tabs: Temel (Basic), Doğrulama (Validation), Gelişmiş (Advanced)
   - Multi-language field editing (label, placeholder, help text)
   - Field-specific validation rules (min/max, pattern, file types)
   - Conditional logic configuration
   - Options management for select/radio/checkbox fields

4. **FormSettings** (`apps/admin/src/components/forms/FormSettings.jsx`, 509+ lines)
   - Form metadata (title, description, slug)
   - Submit button customization
   - Success message and redirect URL
   - Security settings (CAPTCHA, honeypot, authentication)
   - Submission limits and rate limiting
   - **Email Notifications**:
     - Dynamic recipient selection from form fields
     - Support for `{field:fieldId}` placeholders
     - Static email addresses
     - Subject and reply-to customization
     - Integration with TenantSettings SMTP config
   - Webhook configuration with event selection
   - File upload settings (max size, allowed types)
   - Data collection preferences (geo, device info)

#### 2. Backend Validation & Error Handling

**Enhanced Validation** (`apps/api/src/services/formValidation.js`, 393 lines):
- **Türkçe Error Messages**: User-friendly Turkish validation errors
  - "Form başlığı boş bırakılamaz"
  - "Alan adı boş bırakılamaz"
  - "Alan etiketi boş bırakılamaz"
  - "Geçersiz e-posta adresi"
  - "E-posta bildirimleri etkinse, en az bir alıcı e-posta adresi belirtmelisiniz"
  
- **Conditional Validation**: Email notifications and webhooks only validated when enabled
  ```javascript
  // Email notifications disabled → no validation
  // Email notifications enabled → recipients required, replyTo optional
  ```

- **Field Reference Support**: Recipients array accepts both formats:
  - Static emails: `admin@example.com`
  - Dynamic field references: `{field:abc123}` (user's submitted email)

- **Zod Error Format Fix**: Changed `validation.error.errors` → `validation.error.issues`

**API Routes** (`apps/api/src/routes/forms.js`):
- Detailed error logging with `request.log.warn()`
- Error response format:
  ```json
  {
    "error": "ValidationFailed",
    "message": "Formda hata var. Lütfen aşağıdaki alanları kontrol edin.",
    "details": [
      { "path": ["title"], "message": "Form başlığı boş bırakılamaz" },
      { "path": ["fields", 0, "name"], "message": "Alan adı boş bırakılamaz" }
    ]
  }
  ```

#### 3. Frontend Error Display

**Validation Error Banner** (`FormBuilder.jsx`):
- Red alert box with all validation errors
- Turkish field path translation:
  - `title` → "Form Başlığı"
  - `fields` → "Alanlar"
  - `settings.emailNotifications.recipients` → "Ayarlar → E-posta Bildirimleri → Alıcılar"
  - Array indices: `fields.0` → "Alanlar → #1"
- Dismissible with X button
- Auto-clears on successful save

**Error Path Mapping** (`formatErrorPath` function):
```javascript
const pathMap = {
  'title': 'Form Başlığı',
  'emailNotifications': 'E-posta Bildirimleri',
  'recipients': 'Alıcılar',
  'webhooks': 'Webhook',
  // ... 20+ path translations
};
```

#### 4. Dynamic Email Recipients Feature

**Problem Solved**: Users needed to send form submission notifications to email addresses collected in the form itself (e.g., send confirmation to the user who filled the form).

**Implementation**:
1. **Frontend** (`FormSettings.jsx`):
   - Checkbox list of email fields from the form
   - Label display with language support
   - "Kullanıcının girdiği e-posta" explanation
   - Separate sections for form fields vs. static emails

2. **Backend** (`formValidation.js`):
   ```javascript
   recipients: z.array(
     z.string().refine(
       (val) => {
         // Form field reference: {field:fieldId}
         if (val.startsWith('{field:') && val.endsWith('}')) {
           return true;
         }
         // Normal email validation
         return z.string().email().safeParse(val).success;
       }
     )
   )
   ```

3. **Future Backend Processing** (to be implemented in form submission handler):
   ```javascript
   async function resolveEmailRecipients(recipients, submissionData) {
     return recipients.map(recipient => {
       if (recipient.startsWith('{field:')) {
         const fieldId = recipient.slice(7, -1);
         return submissionData[fieldId]; // User's submitted email
       }
       return recipient; // Static email
     });
   }
   ```

#### 5. Integration with Tenant Settings

**Email Configuration**:
- `TenantSettings.smtp.fromEmail` used as default sender
- `replyTo` field optional - falls back to tenant settings
- Form-level override available for custom reply-to addresses

**UI Improvements**:
- Placeholder: "Boş bırakılırsa tenant ayarlarından alınır"
- Help text: "Opsiyonel. Boş bırakılırsa tenant ayarındaki varsayılan e-posta kullanılır."

### Technical Decisions

1. **Drag-Drop Library**: Chose @dnd-kit over react-beautiful-dnd
   - More modern and maintained
   - Better performance with virtualization
   - TypeScript support
   - Smaller bundle size

2. **Form State Management**: Direct React state + React Query
   - No need for Redux/Zustand for this feature
   - React Query handles server state
   - Local state for unsaved changes

3. **Multi-Language Support**: Object format `{ tr: '...', en: '...' }`
   - Backend stores both languages
   - Frontend displays selected language only
   - Language switcher in header

4. **Validation Strategy**: Zod on backend, UI feedback on frontend
   - Server-side validation is source of truth
   - Frontend shows detailed error messages
   - Path-based error mapping for UX

### Known Issues & Debugging

**Field Name Property Issue** (Under Investigation):
- **Symptom**: Field names (`field_1759664860575`) not persisting on save/update
- **Debug Logging Added**:
  ```javascript
  // FormBuilder.jsx
  handleFieldUpdate → console.log('Field update:', { fieldId, updates })
  handleSave → console.log('Fields:', formData.fields)
  ```
- **Potential Causes**:
  - Zod schema stripping unknown properties
  - Field update merge logic
  - Database save/load issue
- **Next Steps**: Check browser console logs during save operation

### Testing Scenarios

#### Validation Testing
✅ **Empty Title**: "Form Başlığı: Form başlığı boş bırakılamaz"
✅ **Empty Field Name**: "Alanlar → #1 → Alan Adı: Alan adı boş bırakılamaz"
✅ **Invalid Email** (notifications enabled): "Ayarlar → E-posta Bildirimleri → Alıcılar: Geçersiz e-posta adresi"
✅ **Empty Recipients** (notifications enabled): "E-posta bildirimleri etkinse, en az bir alıcı e-posta adresi belirtmelisiniz"
✅ **Notifications Disabled**: No validation errors for empty recipients/replyTo

#### Email Recipients Testing
- [ ] Add email field to form
- [ ] Enable email notifications
- [ ] Check email field in "Form Alanlarından E-posta"
- [ ] Verify `{field:xyz}` format in saved data
- [ ] Submit form and verify recipient resolution (pending implementation)

### API Endpoints Status

- ✅ `GET /api/forms` - List forms with pagination
- ✅ `POST /api/forms` - Create form with validation
- ✅ `GET /api/forms/:id` - Get form details
- ✅ `PUT /api/forms/:id` - Update form with validation
- ✅ `POST /api/forms/:id/publish` - Publish form
- ✅ `POST /api/forms/:id/archive` - Archive form
- ✅ `DELETE /api/forms/:id` - Soft delete form
- ✅ `GET /api/forms/:id/versions` - Version history
- ✅ `POST /api/forms/:id/restore/:version` - Restore version
- ✅ `POST /api/forms/:id/duplicate` - Duplicate form
- ✅ `GET /api/forms/check-slug` - Slug availability
- ⏳ `POST /api/forms/:id/submit` - Public form submission (Phase 3)
- ⏳ `GET /api/forms/:id/responses` - Form responses (Phase 3)

### Next Phase Tasks

**Phase 3 - Form Submissions & Responses**:
1. Public form embed/rendering
2. Submission validation and storage
3. Email notification sending with recipient resolution
4. Webhook triggering
5. Response management UI
6. CSV/Excel export
7. Analytics dashboard

**Immediate Priorities**:
1. Fix field name persistence issue (debug logs added)
2. Test email recipient placeholder resolution
3. Add form preview rendering
4. Implement publish → public URL workflow

---
Document last updated: 2025-10-05 (Form Builder Phase 2 - Validation & Email Recipients completed)

