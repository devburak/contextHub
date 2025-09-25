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
- Adjusted `apps/api/src/middleware/auth.js:47` so user lookup during auth only requires the `_id`; this keeps multi-tenant members authenticated when they switch tenants with a freshly issued membership token.
- Updated root `.env` with `R2_PUBLIC_DOMAIN`, upload limit, and default image variants to prepare Cloudflare R2 as the public media CDN (now exposes tenant files under `https://contextstore.ikon-x.com.tr/{slug}/...`).
- Expanded media schema (`packages/common/src/models/Media.js`) with tenant slug snapshots, file naming metadata, variant details, and status fields; introduced R2-backed media service plus `/api/media` routes supporting presigned uploads, automatic variant generation (including WebP thumbnails), and listing with filters.
- Added admin-side media API client and a Media Library page featuring drag & drop uploads, presigned PUT flow, filtering, and listing; linked it into routing/navigation so tenants can manage assets from the UI.
- Tenant picker now fetches memberships with fresh tenant-scoped JWTs so switching assets keeps the correct token in localStorage (`apps/admin/src/pages/tenants/Tenants.jsx`).
- Normalised R2 endpoint handling and forced path-style S3 requests so presigned URLs use `https://<account>.r2.cloudflarestorage.com/<bucket>/...` regardless of env formatting (`apps/api/src/services/mediaService.js`).
- Media API now supports metadata editing, per-item deletion, and bulk tag/delete operations; the admin media page gained a modal inspector with edit form, multi-select tooling, and tag assignment workflows.
- Updated Media UI actions to copy the public CDN URL directly from cards or the detail modal, replacing the old open-in-new-tab link.
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
Document last updated: (content system initial documentation pass)
