# API reference

ContextHub Cloud separates the human integration guides from the executable API contract. The two documentation surfaces deliberately use different hosts and canonical paths.

| Surface | Canonical URL | Purpose |
| --- | --- | --- |
| Developer guides | `https://ctxhub.net/docs` | Concepts, integration patterns, caching, migrations, and managed-service boundaries |
| REST API base | `https://api.ctxhub.net/api` | Production API requests |
| Interactive Swagger UI | [https://api.ctxhub.net/api/docs](https://api.ctxhub.net/api/docs) | Explore the OpenAPI contract and execute authorized requests |
| OpenAPI JSON | [https://api.ctxhub.net/api/docs/json](https://api.ctxhub.net/api/docs/json) | SDK generation and contract tooling |
| OpenAPI YAML | [https://api.ctxhub.net/api/docs/yaml](https://api.ctxhub.net/api/docs/yaml) | Human-readable OpenAPI source |

Do not use `https://api.ctxhub.net/docs`. The managed Edge Gateway exposes Swagger through `/api/docs`; the root `/docs` path is not the public API-reference contract.

## Authentication boundaries

Use `Authorization: Bearer ctx_your_token` for trusted server requests. The token establishes the tenant, role, and scopes. Never place it in browser code.

Browser delivery uses documented `/api/public/*` routes with `X-Tenant-ID` and no private token. The exception is form submission: `POST /api/public/forms/:formId/submit` requires a write-scoped API token and should be proxied through a trusted server when the token cannot be protected.

See [Authentication and tenancy](./authentication.md) for the complete boundary.

## Core route families

| Resource | Representative routes | Typical use |
| --- | --- | --- |
| Content | `GET /api/contents`, `GET /api/contents/slug/:slug` | Pages, news, articles, and reusable editorial blocks |
| Collections | `GET /api/public/collections/:key`, `POST /api/public/queries/run` | Typed repeatable business data and public queries |
| Media | `POST /api/media/presign`, `POST /api/media`, `GET /api/media` | Upload registration, metadata, variants, and external media |
| Menus | `GET /api/public/menus/slug/:slug` | Public navigation trees |
| Forms | `GET /api/public/forms/:slug`, `POST /api/public/forms/:id/submit` | Form definitions and submissions |
| Placements | `POST /api/public/placements/decide`, `POST /api/public/placements/events/batch` | Personalization, experiments, event collection, funnels, realtime reports, and journeys |
| Galleries | `GET /api/galleries`, `PUT /api/contents/:id/galleries` | Ordered media sets linked to editorial content |
| Roles | `GET /api/roles`, `PUT /api/users/:id/role` | Tenant-scoped system and custom role management |
| Activity | `GET /api/activities`, `GET /api/dashboard/api-stats` | Security activity and operational dashboard data |
| Extensions | Versioned Plugin API | Trusted routes, event consumers, settings, entitlements, and admin contributions |
| Tenant | `GET /api/tenant/info` | Tenant identity, branding, and integration metadata |
| Usage | `GET /api/tenants/current/limits` | Plan limits and current tenant usage |

The interactive contract is the authority for the complete route and schema list. These guides explain how to use those contracts safely.

## Response handling

Successful list and detail shapes vary by resource. Check the Swagger schema before depending on a field, then normalize the response at your application boundary.

Treat status families deliberately:

- `400` for invalid input or tenant context.
- `401` for missing or invalid authentication.
- `403` for an authenticated caller without permission or an Edge policy rejection.
- `404` for a missing or non-public resource.
- `409` for a conflicting write such as a duplicate slug.
- `429` for throttling or an exhausted plan quota.
- `5xx` for transient service failures.

Continue with [Placements and personalization](./placements.md), [Roles and permissions](./roles-permissions.md), [Extensions](./extensions.md), [Errors and retries](./errors.md), and [Quotas and usage](./quotas.md).
