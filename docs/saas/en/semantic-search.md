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

### Server-to-server queries with an API token

Tenants with Semantic Search enabled and the `search.semantic` plan entitlement can call `POST https://api.ctxhub.net/api/plugins/semantic-search/query` from their server with an API token. An admin login or simulated session cookie is not required.

Grant the token the `write` scope and the `semanticSearch.query` extension permission. The query does not change source data; the `write` scope is required because this endpoint uses `POST`. Keep the token on your server.

```bash
curl --request POST \
  'https://api.ctxhub.net/api/plugins/semantic-search/query' \
  --header "Authorization: Bearer ${CTXHUB_API_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"query":"haklı nedenle fesih","limit":3,"sourceTypes":["collectionEntry"]}'
```

The tenant is derived from the token. Do not send `tenantId` in the body. Server requests do not need an `Origin` header; the Cloudflare gateway validates the token hash record, tenant status, and token expiry. CORS configuration does not replace token authorization. Public-search opt-in is not required for this authenticated integration.

| Field | Description |
| --- | --- |
| `query` | Required search text, 1–2000 characters. |
| `limit` | 1–20; defaults to 10. |
| `sourceTypes` | Optional array containing `content`, `collectionEntry`, or both. Both types are searched when omitted. |
| `excludeSourceIds` | Optional array of up to 100 source IDs. |

`sourceType: "collection"` and `collection: "chunks"` are not supported query filters. Use `sourceTypes: ["collectionEntry"]` for collection entries. This searches all eligible collections in the tenant; a server-side filter for a single collection key is not available. Collection matches return their collection key as `sourceKey`.

A successful response contains match identifiers and scores, rather than complete source records:

```json
{
  "schemaVersion": 1,
  "matches": [
    {
      "sourceType": "collectionEntry",
      "sourceKey": "chunks",
      "sourceId": "entry-id",
      "score": 0.87
    }
  ]
}
```

Sources are checked for tenant ownership and current `published` status before matches are returned. Read the source fields your application needs through the corresponding content or collection API. No matches produces an empty `matches` array. A panel count of records accepted into the indexing queue does not mean the indexing Worker and search index have finished processing every record.

### Rate limits and errors

The default `/query` budget is 60 requests per 60 seconds per tenant. All API tokens and admin sessions for a tenant share this budget across API processes. The service operator can change the limit; use the response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` as the current values. Exceeding the limit returns `429 RateLimitExceeded`. Wait for the number of seconds in `Retry-After`; debounce input or cache on your server instead of querying on every keystroke.

| Response | Action |
| --- | --- |
| `401` | Check that the token uses `Authorization: Bearer ctx_…`, is valid, and has not expired. For an edge-policy response, ask support to check the token's gateway record. |
| `403` | Check the `write` scope, `semanticSearch.query` permission, tenant status, and `search.semantic` entitlement. If you send `Origin`, it must be allowed for the tenant. |
| `403 SessionRequired` | `GET/PUT /policy`, `GET /indexing`, `POST /reindex`, and `POST /content-suggestions` require an admin session. The current `/query` route accepts API tokens; if this error persists there, send support the endpoint, timestamp, and any `CF-Ray`/request ID. |
| `429` | Wait for `Retry-After` before retrying. |
| `5xx` | A service dependency may be temporarily unavailable; retry with bounded backoff. Queries are not executed while the shared rate-limit store is unavailable. |

Do not connect your application to internal indexing infrastructure or the Query Worker's shared secret. Anonymous public semantic search requires separate opt-in, entitlement, and rate limits; API-token access does not enable it automatically.

See [Managed and commercial capabilities](./managed-capabilities.md) for the SaaS/community boundary.
