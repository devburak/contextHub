# Prompt library

These English prompts are designed for coding agents and architecture assistants. Replace bracketed values and keep secrets out of the conversation.

## Build a public content integration

```prompt
Build a production-ready ContextHub content integration for [framework]. Use only published public delivery endpoints in browser code, identify the tenant with X-Tenant-ID, and never expose a ctx_ API token. Add loading, empty, error, retry, and stale-content states. Use an abortable request, validate external links, and explain the cache keys you chose. Cite the ContextHub documentation assumptions used in the implementation.
```

## Design a safe caching policy

```prompt
Design a tenant-safe caching strategy for a ContextHub application running on Cloudflare. Include request deduplication, a 30–60 second application-cache starting point, edge-cache eligibility, a complete cache-key definition, webhook-driven invalidation, stale-while-revalidate limits, and HIT/MISS/STALE/BYPASS observability. Explicitly list responses that must never be cached.
```

## Review authentication boundaries

```prompt
Review this ContextHub integration for authentication and tenant-isolation bugs. Verify that browser delivery uses /api/public routes without private tokens, private tokens remain server-side, authenticated tenant context cannot be overridden by request bodies, referenced records are checked for tenant ownership, draft content cannot cross the public boundary, and proxy-derived client IPs use a trusted hop. Return findings by severity with concrete fixes and tests.
```

## Plan a Cloudflare edge gateway

```prompt
Create a Cloudflare Workers edge-gateway plan for ContextHub. Cover tenant routing, tenant-specific CORS, public/private route classification, origin protection, trusted client-IP extraction, per-IP and per-identity rate limits, tenant-safe cache keys, fail-closed production configuration, request-ID propagation, secret bindings, and deployment preflight checks. Do not include real account IDs, tokens, or resource identifiers.
```

## Add semantic search

```prompt
Design a commercial semantic-search integration for ContextHub using Cloudflare Queues, Workers AI, Vectorize, D1, and temporary R2 snapshots. MongoDB must remain the source of truth. Index only published, explicitly allow-listed fields; namespace vectors by tenant; use monotonic event ordering and idempotent jobs; and rehydrate candidates through ContextHub before returning results. Include DLQ, reconciliation, reindex, data-purge, and relevance-evaluation plans.
```

## Build a documentation chatbot

```prompt
Build a grounded documentation chatbot from the ContextHub public documentation catalog. Incrementally ingest only documents whose checksums changed, chunk Markdown by headings, preserve citations, retrieve with Vectorize, and answer with Workers AI. The assistant must distinguish core and commercial capabilities, refuse secret or cross-tenant requests, avoid inventing endpoints, and state when the corpus does not contain an answer. Add an evaluation set for retrieval, citations, prompt injection, and refusal behavior.
```

## Build a Cloudflare MCP server

```prompt
Create a read-only Cloudflare MCP server for the ContextHub developer documentation. Prefer createMcpHandler() and expose four goal-oriented tools: list_docs, read_doc, search_docs, and get_example_prompts. Validate slugs against catalog.json, cap output sizes, return source URLs and checksums, add rate limiting and structured logs, and do not expose private tenant content or secrets. Include tests for invalid slugs, oversized requests, unavailable documents, and citation metadata.
```

## Review a plugin

```prompt
Review this ContextHub plugin against the extension contract. Check API and admin revision compatibility, reserved route collisions, declared permissions and feature entitlements, tenant-scoped settings, event-consumer idempotency, cross-tenant denial, secret handling, reversible installation, and derived-data cleanup. Identify any direct imports of internal models or database connections that should use a host facade.
```
