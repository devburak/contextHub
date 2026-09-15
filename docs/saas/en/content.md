# Content

Use Content for editorial material with a publishing lifecycle: pages, news, articles, announcements, policies, or reusable narrative blocks. Content is the right choice when editors need a title, slug, rich body, categories, tags, scheduling, and version history.

## Core fields

| Field | Purpose |
| --- | --- |
| `title` | Editor-facing and display title |
| `slug` | Stable URL-friendly lookup key within the tenant |
| `status` | `draft`, `scheduled`, `published`, or `archived` |
| `summary` | Card, listing, SEO, or preview text |
| `lexical` | Structured rich-text editor state |
| `html` | Renderable rich-text output; sanitize before injection |
| `featuredMediaId` | Primary Media reference |
| `categories`, `tags` | Editorial classification and filtering |
| `customFields` | Tenant-wide extensible values keyed by field definition |
| `publishAt`, `publishedAt` | Scheduling and publication timestamps |
| `version` | Current content revision number |

## List published content

Content delivery uses a server-side API token:

```bash
curl --get "https://api.ctxhub.net/api/contents" \
  --header "Authorization: Bearer ctx_your_token" \
  --data-urlencode "status=published" \
  --data-urlencode "categoryName=News" \
  --data-urlencode "page=1" \
  --data-urlencode "limit=20"
```

Available filters include `search`, category or tag IDs/names, publication date range, pagination, and filterable custom fields.

The list response is `{ items, pagination }`. `pagination` contains `page`, `limit`, `total`, and `pages`. Items are sorted by `publishedAt` descending, then `_id` descending for equal timestamps.

| `view` | List content |
| --- | --- |
| `summary` | Content fields except `html` and `lexical`; titles, summaries, category/tag relations, featured media, and permitted custom fields remain available |
| `full` (default) | Content fields including `html` and `lexical` |

Public custom field rules apply to API tokens in both views. `view=full` does not expose private custom fields.

Use `category` or comma-separated `categories` for category ID filters, and `tag` for tag ID filters. An invalid ID returns `400`, even when the other IDs in the list are valid. `categoryName` and `tagName` use case-insensitive literal substring matching; regex metacharacters are not executed as search expressions. A name-only filter with no match within the tenant returns an empty result. IDs and names supplied within the same category or tag filter use OR semantics; when both category and tag filters are supplied, both apply.

## Fetch by slug

Prefer a slug lookup for page rendering:

```js
const url = new URL('https://api.ctxhub.net/api/contents/slug/about-us')
url.searchParams.set('status', 'published')

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${process.env.CTX_API_TOKEN}` },
})

if (response.status === 404) return null
if (!response.ok) throw new Error(`Content request failed: ${response.status}`)
const { content } = await response.json()
```

`GET /api/contents/slug/:slug` and `GET /api/contents/:id` return the full content body, including `html` and `lexical`. Detail requests do not require `view=full`.

## Version history

```text
GET /api/contents/:id/versions?page=1&deletedPage=1&limit=20
GET /api/contents/:id/versions/:versionId
```

History lists paginate version metadata without loading the bodies. `page` selects active versions and `deletedPage` selects deleted versions; both default to `1`. `limit` applies to each list, defaults to `20`, and has a maximum of `100`.

| Response field | Content |
| --- | --- |
| `versions` | Metadata for the selected page of active versions |
| `deletedVersions` | Metadata for the selected page of deleted versions, including deletion actor information |
| `pagination`, `deletedPagination` | `page`, `limit`, `total`, and `pages` for the corresponding list |
| `hasPublishedVersion` | Whether any active version has published status, independently of the selected page |
| `deletionLog` | Deletion records for the selected page of deleted versions |

To preview or edit a version's body, pass the version record's `_id` as `:versionId`, not its numeric `version`. The single-version endpoint returns the selected snapshot in `{ version }`, including `html` and `lexical`. Custom field visibility rules still apply to API-token responses.

## Integration migration at deployment

**Existing theme compatibility is preserved:** `GET /api/contents` without `view` continues to return full content, including `html` and `lexical`. Admin lists explicitly use `view=summary`. Card integrations should select `view=summary` when they do not need content bodies.

Version history integrations must also stop assuming every snapshot is included in one response. Use each list's pagination data to load additional pages, and fetch a single version when its body is needed. `deletionLog` covers only the returned page of deleted versions.

## Custom fields

Custom field definitions are tenant-wide, not tied to one content type or category. Supported definition types include text, number, boolean, date, select, multi-select, URL, JSON, reference, and multi-reference.

- `public: true` allows an API-token response to include the field value.
- `filterable: true` enables `custom.<key>=value` filtering.
- `searchable: true` includes the field in text search.
- Do not make sensitive fields filterable: result counts and slugs can reveal information.

```text
GET https://api.ctxhub.net/api/contents?status=published&custom.eventType=conference
```

## Rendering guidance

- Use `summary` for cards and `html` for the full body.
- Sanitize `html` with an allow-list before rendering.
- Resolve featured media through the returned relation or your server-side media service.
- Cache published list/detail reads; never cache previews, drafts, or mutations.
- Treat IDs as opaque and build public URLs from slugs.

Use [Collections](./collections.md) when the primary need is typed repeatable data rather than an editorial document.
