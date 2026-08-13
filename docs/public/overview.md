# Developer overview

ContextHub is a multi-tenant headless content platform. Applications consume published content through public delivery endpoints, while trusted servers and administrators use authenticated endpoints for management operations.

## Integration model

Treat every request as belonging to exactly one tenant. Public delivery requests identify that tenant with `X-Tenant-ID` or a documented `tenantId` query parameter. Private requests use a scoped `ctx_...` token. Browser admin sessions use secure cookies and CSRF protection.

```text
Browser or application
        |
        v
Cloudflare Edge Gateway
  - tenant CORS
  - public/private route policy
  - cache and origin protection
        |
        v
ContextHub API -> MongoDB / object storage
        |
        +-> webhooks and domain events
        +-> optional commercial plugins
```

## Recommended path

1. Create a tenant and configure its allowed origins.
2. Use public endpoints for published website content.
3. Keep API tokens on trusted servers only.
4. Add a short application cache and webhook-driven invalidation.
5. Put the Cloudflare Edge Gateway in front of production traffic.
6. Enable commercial plugins only for tenants with the matching entitlement.

## Security boundary

- Never expose a `ctx_...` token in browser JavaScript, mobile binaries, public repositories, or logs.
- Never trust a tenant ID supplied in a mutation body. The authenticated tenant context is authoritative.
- Public delivery must return published data only. Preview and draft workflows require an authenticated boundary.
- Do not call write endpoints from a CDN cache path.
- Give plugins explicit permissions and feature entitlements; installation alone must not grant access.

## Documentation as data

Every page in this portal comes from a Markdown file. The generated public corpus also exposes:

- `/developer-docs/catalog.json` for discovery and search metadata.
- `/developer-docs/*.md` for individual source documents.
- `/developer-docs/llms.txt` for an AI-readable index.
- `/developer-docs/llms-full.txt` for a complete, versioned corpus.

This makes the same reviewed documentation usable by humans, retrieval pipelines, chatbots, and MCP servers without maintaining a second knowledge source.

## Next steps

Start with [Quickstart](./quickstart.md), then choose an authentication model in [Authentication and tenancy](./authentication.md). Before production, implement [Caching and freshness](./caching.md) and [Webhooks and invalidation](./webhooks.md).
