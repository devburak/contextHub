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

## Maintenance Notes
- Update this file after every code or config change handled by Codex so we keep a running history and high-level context for the project.

## Media Roadmap
- Backend
  - [ ] Create an S3 client wrapper (likely via `@aws-sdk/client-s3`) that reads R2 credentials, bucket, and image variant sizes from environment variables and resolves public URLs using `R2_PUBLIC_DOMAIN` and tenant slug.
  - [ ] Introduce `/media` routes (list, upload, update metadata, delete) guarded by tenant auth; enforce a 100 MB payload limit and accept multipart uploads with variant generation (Sharp) for `thumbnail`, `medium`, `large`, plus original.
  - [ ] Persist file metadata to `Media` model (size, mime, variants, tags, alt text, uploader) and allow filtering by tag, type, and text search.
- Admin UI
  - [ ] Build a “Media / Ortam” section with a grid/list view, client-side filters (type, tags, text), and forms to edit alt text and tags.
  - [ ] Implement an upload dialog supporting drag & drop, per-tenant slug-based foldering, and progress feedback; ensure errors respect server limits.
- Integration
  - [ ] Expose a reusable picker component so other forms (e.g., content editors) can select existing assets, and propagate selected file metadata (URL, alt, variants) through the app.
