# Cloudflare architecture

Cloudflare can provide the production edge, caching, asynchronous processing, and AI retrieval layer around ContextHub. Keep ContextHub as the source of truth; derived edge and AI stores must be rebuildable.

## Edge gateway

A Worker in front of the API should:

- map the request to a configured tenant;
- enforce tenant-specific CORS;
- classify public, private, and unsupported paths;
- prevent direct origin access with a shared origin secret or equivalent control;
- build tenant-safe cache keys for public GET requests;
- preserve and propagate request IDs;
- reject invalid configuration rather than failing open in production.

Do not put a private ContextHub token into a response or browser-visible Worker bundle. Secrets belong in Worker secret bindings.

## Service map

| Cloudflare service | Recommended responsibility |
| --- | --- |
| Workers | Edge gateway, webhook receiver, query API, MCP server |
| KV | Small, read-heavy tenant routing and CORS configuration |
| Queues | Webhook, indexing, and cache-invalidation work |
| D1 | Durable manifests, cursors, idempotency, and audit metadata |
| R2 | Large temporary snapshots or versioned document artifacts |
| Workers AI | Embeddings and grounded answer generation |
| Vectorize | Tenant-namespaced vector retrieval |

## Deployment boundaries

- Use separate resources and secrets for development, staging, and production.
- Keep resource IDs out of public documentation and client bundles.
- Fail deployment preflight when a required binding, queue, DLQ, or secret is missing.
- Add resource lifecycle rules for temporary R2 objects.
- Use structured logs and tail sampling; redact authorization and content fields that may contain personal data.
- Pin compatibility dates and test changes before promotion.

## Data ownership

MongoDB remains the content source of truth. KV, D1, Vectorize, and R2 contain routing data, durable processing state, or derived data. A purge or reindex operation must not mutate source content.

## Reference architecture

```text
Client
  -> Worker edge gateway
     -> public cache / KV tenant config
     -> ContextHub API
        -> MongoDB source content
        -> domain events / webhooks
           -> Queue
              -> Worker consumer
                 -> D1 manifest
                 -> Workers AI
                 -> Vectorize
                 -> temporary R2 snapshots
```

For current implementation details, use the official [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/), [Workers AI documentation](https://developers.cloudflare.com/workers-ai/), and [Vectorize documentation](https://developers.cloudflare.com/vectorize/).

Read [Semantic search](./semantic-search.md) for the commercial retrieval pipeline.
