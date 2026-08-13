# ContextHub Cloud overview

This guide is for customers building on the managed ContextHub SaaS at `ctxhub.net`. It documents the operated API, tenant boundary, delivery patterns, and managed capabilities available through ContextHub Cloud. It is not a promise that every described service exists in the community repository.

## Service boundary

ContextHub Cloud combines the core content platform with operated infrastructure and commercial services.

| Area | ContextHub Cloud responsibility |
| --- | --- |
| Content platform | Tenant-aware content, collections, media, menus, forms, placements, and admin workflows |
| API edge | `https://api.ctxhub.net` routing, tenant CORS, origin protection, and public/private route policy |
| Managed delivery | Hosted API operations, media delivery, monitoring, upgrades, and support |
| Managed capabilities | Plan-dependent services such as Semantic Search and commercial plugins |

The public repository contains the open-core platform and extension contracts. The `ctxhub.net` service also includes operated infrastructure, private companions, configuration, and commercial capabilities that are not shipped as community-repository features.

## Integration model

```text
Your browser or server
        |
        v
https://api.ctxhub.net
  ContextHub Edge Gateway
        |
        v
Tenant-scoped ContextHub Cloud services
```

Use a server-side `ctx_...` API token for authenticated content, media, schema, and management reads. Use deliberately public `/api/public/*` routes with `X-Tenant-ID` for browser delivery. Never embed an API token in browser JavaScript.

## Choose the right resource

- **Content** is for editorial pages, articles, announcements, and reusable narrative records.
- **Collections** are for typed repeatable data such as locations, people, products, events, or FAQs.
- **Media** manages uploaded files, image variants, accessibility metadata, and external video records.
- **Menus** describe navigation trees.
- **Forms** describe input schemas and collect submissions.
- **Placements** select targeted popups, banners, inline experiences, or custom views.

## Recommended production path

1. Create the tenant and configure allowed browser origins in ContextHub Cloud.
2. Create a least-privilege API token for server-side integration.
3. Model editorial information with Content and structured records with Collections.
4. Add a 30–60 second application cache for safe reads.
5. Invalidate affected cache keys from verified webhooks.
6. Ask ContextHub about plan-dependent managed capabilities before building against them.

Continue with [Quickstart](./quickstart.md) and [Authentication and tenancy](./authentication.md).
