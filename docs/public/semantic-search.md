# Semantic search

Semantic Search is a commercial ContextHub plugin. It creates a tenant-isolated, rebuildable search index from explicitly approved published fields.

## Availability

The plugin requires the matching feature entitlement and permissions. Installation does not automatically enable indexing or public search. Public search remains opt-in and must have its own tenant policy and rate limit.

## Indexing pipeline

1. ContextHub emits ordered domain events for content and collection changes.
2. The plugin reads the current source through the versioned ContextHub extension facade.
3. A tenant policy allow-list removes fields that were not explicitly approved.
4. A versioned, idempotent job is sent to Cloudflare Queues.
5. An indexer Worker generates embeddings with Workers AI.
6. Vectorize stores tenant-namespaced vectors; D1 stores the source manifest and ordering state.
7. Large sanitized payloads may use short-lived R2 snapshots with integrity metadata.

The current contract uses extension API v1 revision 4 and admin API v1 revision 3. The embedding profile is `@cf/baai/bge-m3`, 1024 dimensions, cosine distance. Changing dimensions or metric requires a new index and a controlled migration.

## Query safety model

Vector search returns source identifiers and scores, not authoritative content. The API plugin re-reads candidates through ContextHub and re-applies tenant, permission, existence, and publication checks before returning results.

This prevents stale vectors from exposing unpublished, deleted, or cross-tenant content.

## Default-deny data policy

- Only published sources are indexed.
- The initial safe allow-list is title, summary, normalized body, categories, and tags.
- Custom fields require explicit tenant-admin opt-in.
- Collections and their fields require explicit opt-in.
- Personal, secret, or sensitive fields are default-deny.
- Vector metadata contains identifiers and revisions, not the full source text.

## Reliability

Jobs contain a schema version, tenant, source revision, monotonic event sequence, content hash, and idempotency key. Duplicate and stale events are safe to acknowledge. Transient Workers AI, Vectorize, D1, or network failures retry with bounded exponential backoff. Poison messages move to a dead-letter queue.

Delete and unpublish operations remove only derived Vectorize, D1, and temporary R2 data. They do not write to MongoDB source collections.

## Operations checklist

- Keep all index writers behind the same ordering contract.
- Monitor queue age, retry count, DLQ depth, embedding latency, and retrieval quality.
- Reconcile the source manifest without granting Workers direct MongoDB access.
- Use blue-green indexes for model, dimension, or metric migrations.
- Evaluate relevance and safety with a tenant-specific test set before rollout.

See [AI assistants and MCP](./ai-mcp.md) for grounded answer generation on top of retrieval.
