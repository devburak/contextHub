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
