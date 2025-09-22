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

## Maintenance Notes
- Update this file after every code or config change handled by Codex so we keep a running history and high-level context for the project.
