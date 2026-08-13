# Managed semantic search

Semantic Search is a plan-dependent ContextHub Cloud capability. It is operated as a managed commercial service and is not included as a ready-to-run feature in the community repository.

## What it provides

- Meaning-based search across approved tenant Content and Collection fields.
- Related-content suggestions for editorial workflows.
- Tenant-isolated indexes and entitlement-controlled access.
- Managed indexing, retries, reconciliation, monitoring, and upgrades.

## Data policy

Only published sources and explicitly approved fields are eligible. The default safe content set is title, summary, normalized body, categories, and tags. Custom fields and collection fields require tenant-admin opt-in. Personal, secret, or sensitive values remain default-deny.

## Result safety

Search index matches are candidates, not authoritative content. ContextHub Cloud revalidates tenant ownership, existence, entitlement, permissions, and current publication state before returning a result. A stale index entry cannot make deleted, unpublished, or cross-tenant content visible.

## Enablement workflow

1. Confirm that the tenant plan includes Semantic Search.
2. Define source types and field allow-lists with ContextHub support or the tenant admin experience.
3. Approve any collection and custom fields individually.
4. Run initial indexing and review coverage.
5. Evaluate relevance with real tenant queries.
6. Enable public search only with explicit opt-in and a separate rate limit.

## Integration guidance

Use only the managed endpoint and permissions documented for the enabled tenant. Do not couple your application to internal indexing infrastructure. Treat result IDs as candidates and render the revalidated source payload returned by ContextHub Cloud.

See [Managed and commercial capabilities](./managed-capabilities.md) for the SaaS/community boundary.
